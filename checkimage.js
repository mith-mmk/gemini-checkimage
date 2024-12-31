// node?
const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
// google app script?
const isGas = typeof UrlFetchApp !== "undefined";

const model = 'gemini-1.5-flash';
// const model = 'gemini-2.0-flash-exp';

let API_KEY = '';

if (isNode) {
  const dotenv = require('dotenv');
  dotenv.config();
  API_KEY = process.env.AISTUDIO_KEY;
} else if (isGas) {
  API_KEY = PropertiesService.getScriptProperties().getProperty('AISTUDIO_KEY');
}

// APIキーの設定 for browser
function setAPIKey(key) {
  API_KEY = key;
}

function printLog(... message) {
  if (!isGas) {
    console.log(...message);
  } else {
    Logger.log(...message);
  }
}

// goole drive のfile idを指定してblobを取得
async function getImageOnGAS(imgFile) {
  const isFileId = /^[\w-]{25,}$/.test(imgFile);

  let file;
  if (typeof imgFile === 'string') {
    if (isFileId) {
      file = DriveApp.getFileById(imgFile);
    } else {
      const files = DriveApp.getFilesByName(imgFile);
      if (files.hasNext()) {
        file = files.next();
      } else {
        throw new Error('File not found');
      }
    }
  } else {
    // Fileオブジェクトの場合
    file = imgFile;
  }
  const blob = file.getBlob();
  const result = {
    "base64": Utilities.base64Encode(blob.getBytes()),
    "mineType": blob.getContentType(),
  }
  return result;
}

// node.js で実行する場合
async function getImageOnNode(imgFile) {
  const fs = require('fs');
  const data = fs.readFileSync(imgFile);
  const base64 = data.toString('base64');
  // check image type
  let mineType = '';
  let ext = imgFile.split('.').pop().toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      mineType = 'image/jpeg';
      break;
    case 'png':
      mineType = 'image/png';
      break;
    case 'gif':
      mineType = 'image/gif';
      break;
    case 'webp':
      mineType = 'image/webp';
      break;
    default:
      mineType = 'image/jpeg';
      break;
  }
  const result = {
    "base64": base64,
    "mineType": mineType,
  }
  return result;
}

async function getImageOnHTML(imgFile) {
  const response = await fetch(imgFile);
  const blob = await response.blob();
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
  // check image type
  const mineType = base64.split(',')[0].split(':')[1].split(';')[0];
  return {
    "base64": base64.split(',')[1],
    "mineType": mineType,
  } 
}

const getImage = isNode ? getImageOnNode : isGas ? getImageOnGAS : getImageOnHTML;

async function fetchAIonGAS(url, data) {
  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(data)
  });
  return JSON.parse(response.getContentText());
}

async function fetchAIonNode(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return await response.json();
}

async function fetchAI(url, data) {
  return isNode ? fetchAIonNode(url, data) : fetchAIonGAS(url, data);
}


async function postAI(imgFile, prompt=null) {
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  const promptText = prompt || 'この画像に15文字以内で日本語のタイトルをつけてください. 例: お花畑.';
  const result = await getImage(imgFile);
  const base64 = result.base64;
  const mimieType = result.mineType;
  const json = await fetchAI(endpoint, {
    "contents": [{
      "parts": [
        {
          "inline_data": {
            "mime_type": mimieType,
            "data": base64,
          }
        },
        { "text": `${promptText}. NSFWスコア(nsfw)を0.0-1.0の範囲で出力してください.` }
        
      ],
    }],
    "generationConfig": {
        "response_mime_type": "application/json",
        "response_schema": {
          "type": "OBJECT",
          "properties": {
            "title": {"type":"STRING","description": "TITLE of image", "nullable": false},
            "nsfw": {"type":"NUMBER","description": "SNFW score", "nullable": false},
          }
        }
    }
  });
  return json;
}

function path2file(path) {
  if (!isGas) {
    throw new Error('This function is only available in Google Apps Script');
  }
  const pathParts = filePath.split('/');
  const fileName = pathParts.pop(); // 最後の部分がファイル名
  let folder = DriveApp.getRootFolder(); // ルートフォルダから開始

  // フォルダを順に辿る
  for (const part of pathParts) {
    const folders = folder.getFoldersByName(part);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      throw new Error(`Folder not found: ${part}`);
    }
  }

  // 最後にファイルを取得
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    return files.next();
  } else {
    throw new Error(`File not found: ${fileName}`);
  }
}

function eventsParser(eventsCsv) {
  const today = new Date();
  const dayText = ('00' + (today.getMonth() + 1)).slice(-2) + ('00' + today.getDate()).slice(-2);
  const events = {};
  if (isNode) {
    const fs = require('fs');
    const data = fs.readFileSync(eventsCsv, 'utf-8');
    const lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const event = line.split(',');
      if (event.length > 1) {
        events[event[0]] = event[1];
      }
    }
  } else if (isGas) {
    const file = path2file(eventsCsv);
    const data = file.getBlob().getDataAsString();
    const lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const event = line.split(',');
      if (event.length > 1) {
        events[event[0]] = event[1];
      }
    }
  }
  return events[dayText] || '';
}


function test(file, prompt=null) {
  const addPrompt = eventsParser('events.csv');
  prompt = prompt + addPrompt + '.';
  // console.log(`prompt: ${prompt}`);

  postAI(file, prompt).then((data) => {
    // printLog(JSON.stringify(data, null, 2));
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
    // result が null の場合はエラー
    if (result == null) {
      printLog('エラーが発生しました, 予期したデータが取得できません。プロンプトを確認するかもう一度試してください');
      return;
    }
    const jsoninfo = JSON.parse(result);
    if (jsoninfo?.nsfw > 0.8) {
      printLog('NSFW画像です', jsoninfo.nsfw);
      printLog(jsoninfo.title);
    } else {
      printLog('NSFW画像ではありません', jsoninfo.nsfw);
      printLog(jsoninfo.title);
    }
  }).catch((error) => {
    printLog('エラーが発生しました', error);
  });    
}

if (isNode) {
  const file = process.argv[2] || 'images/1.jpg';
  const prompt = process.argv[3] || null;
  test(file, prompt);
}
