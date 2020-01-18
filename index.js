require('dotenv').config()
const EventEmitter = require('events').EventEmitter;
const axios = require('axios');
const fs = require('fs');
const path = require('path');

let isFinish = false;
const pageNum = 30;
let count = 0;

// 该页面从哪个index开始
let pageStart = 0;
let isPhotoQueueFinished = false;
let currentAlbum, currentPhoto, albumQueue, photoQueue;
let event;

const getAlbumUrl = 'https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/fcg_list_album_v3';
const getPhotosUrl = 'https://h5.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_list_photo';
const getFloatViewUrl = 'https://h5.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_floatview_photo_list_v2';

async function getAlbums() {
  try {
    const res = await axios.get(getAlbumUrl, {
      params: {
        g_tk: process.env.G_TK,
        hostUin: process.env.QQ,
        uin: process.env.QQ,
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        format: 'json',
      },
      headers: {
        cookie: process.env.COOKIE,
      },
    });
    let albumList = [];
    if (res.data.data.albumListModeSort) {
      albumList = res.dat.data.albumListModeSort;
    } else if (res.data.data.albumListModeClass) {
      res.data.data.albumListModeClass.forEach(item => {
        albumList = albumList.concat(item.albumList);
      });
    }
    return albumList;
  } catch (e) {
    console.log('TR: getAlbums -> e', e);
    return [];
  }
}

async function getPhotos(topicId, pageStart) {
  const res = await axios.get(getPhotosUrl, {
    params: {
      g_tk: process.env.G_TK,
      hostUin: process.env.QQ,
      uin: process.env.QQ,
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      format: 'json',
      topicId,
      pageStart,
      pageNum,
    },
    headers: {
      cookie: process.env.COOKIE,
    },
  });
  if (typeof res.data !== 'object') {
    console.log('返回内容有误，请检查是否某些照片名称乱码');
    return [];
  }
  return res.data.data.photoList;
}

async function getFloatViewList(topicId, picKey) {
  const res = await axios.get(getFloatViewUrl, {
    params: {
      g_tk: process.env.G_TK,
      hostUin: process.env.QQ,
      uin: process.env.QQ,
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      cmtNum: '10',
      appid: 4,
      isFirst: 1,
      prevNum: 0,
      postNum: 0,
      topicId,
      picKey,
    },
    headers: {
      cookie: process.env.COOKIE,
    },
  });
  const data = JSON.parse(res.data.substr(10, res.data.length - 10 - 2));
  const video_url = data.data.photos[0]['video_info']['video_url'];
  return video_url;
}

function makeAlbumDir(albumName) {
  return fs.promises.mkdir(`images/${albumName}`);
}

function getFilesCount(albumName) {
  try {
    const files = fs.readdirSync(`images/${albumName}`);
    return files.length;
  } catch (e) {
    return 0;
  }
}

function getPhotoBinary(url) {
  return axios.get(url, {
    responseType: "arraybuffer",
  });
}

async function savePhotoToFile(data, albumName, photoName, ext) {
  return fs.promises.writeFile(`images/${albumName}/${photoName}.${ext}`, data, "binary");
}

async function NextPhoto() {
  try {
    if (photoQueue.length <= 0) {
      event.emit('NextPhotoQueue');
      return;
    }
    currentPhoto = photoQueue.shift();
    if (currentPhoto.is_video) {
      const video_url = await getFloatViewList(currentAlbum.id, currentPhoto.picKey);
      const { headers, data } = await getPhotoBinary(video_url);
      const ext = headers['content-type'].split('/')[1] || 'mp4';
      await savePhotoToFile(data, currentAlbum.name, currentPhoto.name, ext);
      console.log(`视频保存成功 ${++count} 个`);
    } else {
      const { headers, data } = await getPhotoBinary(currentPhoto.url);
      const ext = headers['content-type'].split('/')[1] || 'jpg';
      await savePhotoToFile(data, currentAlbum.name, currentPhoto.name, ext);
      console.log(`照片保存成功 ${++count} 张`);
    }
  } catch (e) {
    console.log(e);
    console.log('-----');
    console.log('照片保存失败');
    console.log(`相册名称: ${currentAlbum.name}`);
    console.log(`相册ID: ${currentAlbum.id}`);
    console.log(`照片名称: ${currentPhoto.name}`);
    console.log(`照片key: ${currentPhoto.lloc}`);
    console.log(`照片预览: ${currentPhoto.pre}`);
    console.log('=====');
    showDebug();
  }
  event.emit('NextPhoto');
}

async function NextAlbum() {
  try {
    pageStart = 0;
    isPhotoQueueFinished = false;
    if (albumQueue.length <= 0) {
      console.log('全部下载完毕！');
      return;
    }

    // do {
    currentAlbum = albumQueue.shift();
    currentAlbum.name = currentAlbum.name.replace(/["']/gi, '');
    // } while (currentAlbum.name !== '2018.11.10')


    if (currentAlbum.total === 0) {
      console.log(`${currentAlbum.name} 该相册无照片`);
      event.emit('NextAlbum');
      return;
    }

    if (currentAlbum.total === getFilesCount(currentAlbum.name)) {
      console.log(`${currentAlbum.name} 该相册照片已全部下载`);
      event.emit('NextAlbum');
      return;
    }

    console.log('开始下载相册：', currentAlbum.name);
    const result = await makeAlbumDir(currentAlbum.name);
    event.emit('NextPhotoQueue');
  } catch (e) {
    if (e.code === 'EEXIST') {
      event.emit('NextPhotoQueue');
    } else {
      console.log(`目录创建失败：${currentAlbum.name}`);
      console.log(e);
      showDebug();
    }
  }
}

async function NextPhotoQueue() {
  try {
    if (isPhotoQueueFinished) {
      console.log('开始下一个相册');
      event.emit('NextAlbum');
      return;
    } else {
      isPhotoQueueFinished = pageStart + pageNum >= currentAlbum.total ? true : false;
    }
    const photos = await getPhotos(currentAlbum.id, pageStart);
    pageStart += pageNum;
    photoQueue = photos.map((item) => {
      const photo = {};
      photo.name = `${item.name}_${item.lloc}`.replace(/["'\!\*\\\/\-\:\.\s]/gi, '_');
      if (item.raw_upload) {
        photo.url = item.raw;
      } else {
        photo.url = item.url;
      }
      photo.is_video = item.is_video;
      photo.picKey = item.lloc || item.sloc;
      return photo;
    });
    event.emit('NextPhoto');
  } catch (e) {
    console.log(e);
    showDebug();
  }
}

function initEvent() {
  event = new EventEmitter();
  // 保存完图片后，下载并保存下一张图片
  event.on('NextPhoto', NextPhoto);
  // 保存完该队列图片后，获取下一个队列
  event.on('NextPhotoQueue', NextPhotoQueue);
  // 保存完该相册后，获取下一个相册
  event.on('NextAlbum', NextAlbum);
}

function showDebug() {
  // console.log('TR: NextPhoto -> currentAlbum', currentAlbum);
  // console.log('TR: NextPhoto -> currentPhoto', currentPhoto);
}

async function main() {
  // if (!config.qq || !config.cookie || !config.g_tk) {
  //   console.log('请配置config');
  //   return;
  // }
  initEvent();
  albumQueue = [];
  photoQueue = [];
  // 获取相册列表，加入相册队列
  albumQueue = await getAlbums();
  await NextAlbum();
}

main();
