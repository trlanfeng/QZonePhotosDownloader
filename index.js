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
  return res.data.data.albumListModeSort;
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
      const ext = headers['content-type'].splice('/')[1] || 'mp4';
      await savePhotoToFile(data, currentAlbum.name, currentPhoto.name, ext);
      console.log(`视频保存成功 ${++count}`);
    } else {
      const { headers, data } = await getPhotoBinary(currentPhoto.url);
      const ext = headers['content-type'].splice('/')[1] || 'jpg';
      await savePhotoToFile(data, currentAlbum.name, currentPhoto.name, ext);
      console.log(`照片保存成功 ${++count} 张`);
    }
  } catch (e) {
    console.log(`照片保存失败：${currentPhoto.name}`);
    console.log(e);
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
    currentAlbum = albumQueue.shift();
    currentAlbum.name = currentAlbum.name.replace(/["']/gi, '');
    console.log('开始下载相册：', currentAlbum.name);
    const result = await makeAlbumDir(currentAlbum.name);
    event.emit('NextPhotoQueue');
  } catch (e) {
    if (e.code === 'EEXIST') {
      event.emit('NextPhotoQueue');
    } else {
      console.log(`目录创建失败：${currentAlbum.name}`);
      console.log(e);
    }
  }
}

async function NextPhotoQueue() {
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
    photo.name = `${item.name.replace(/["'.]/gi, '')}.${item.uploadtime}.${+new Date()}`;
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
