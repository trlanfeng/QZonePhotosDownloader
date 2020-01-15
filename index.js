require('dotenv').config()
const axios = require('axios');
const fs = require('fs');

let isFinish = false;
const pageSize = 30;

const getAlbumUrl = 'https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/fcg_list_album_v3';
const getPhotosUrl = 'https://h5.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_list_photo';
const getFloatViewUrl = 'https://h5.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_floatview_photo_list_v2';

async function getAlbum() {
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

  console.log('TR: getAlbum -> res', res.data);
}

async function getPhotos(topicId) {
  const res = await axios.get(getAlbumUrl, {
    params: {
      g_tk: process.env.G_TK,
      hostUin: process.env.QQ,
      uin: process.env.QQ,
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      format: 'json',
      topicId,
      pageStart: 0,
      pageNum: 30,
    },
    headers: {
      cookie: process.env.COOKIE,
    },
  });

  console.log('TR: getAlbum -> res', res.data);
}

async function getFloatViewList(topicId) {
  const res = await axios.get(getAlbumUrl, {
    params: {
      g_tk: process.env.G_TK,
      hostUin: process.env.QQ,
      uin: process.env.QQ,
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      format: 'json',
      cmtNum: '10',
      appid: 4,
      prevNum:0,
      postNum: 1,
      topicId,
      picKey: 'NDR0o5ZLFREopFojrQ8pjgEAAAAAAAA!',
    },
    headers: {
      cookie: process.env.COOKIE,
    },
  });

  console.log('TR: getAlbum -> res', res.data);
}

async function getPageData(url) {
  const res = await axios.get(url, {
    headers: {
      'X-Request': 'JSON',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
  const data = res.data;
  const folderName = data.board.title;
  const path = `images/${folderName}`;
  const urlList = data.board.pins.map(item => item.file.key);
  const pinsCount = data.board.pins.length;
  fs.mkdir(path, (err) => {

    if (err && err.code !== 'EEXIST') {
      throw err;
    }
    getAndSaveImage(urlList, path);

    if (pinsCount < pageSize) {
      return;
    } else {
      max = data.board.pins[pinsCount - 1].pin_id;
      url = `${originUrl}?max=${max}&limit=${pageSize}`;
      getPageData(url);
    }
  });
}

function getAndSaveImage(list, path) {
  list.forEach(item => {
    axios.get(`https://hbimg.huabanimg.com/${item}`, {
      responseType: "arraybuffer",
    }).then(res => {
      fs.writeFile(`${path}/${item}.jpg`, res.data, "binary", function (err) {
        if (err) {
          console.log('TCL: main -> err', err);
        } else {
          console.log(`${item}保存成功`);
        }
      });
    })
  })
}

async function main() {
  if (!config.qq || !config.cookie || !config.g_tk) {
    console.log('请配置config');
    return;
  }
  await getPageData(originUrl);
}

// main();

getAlbum();
