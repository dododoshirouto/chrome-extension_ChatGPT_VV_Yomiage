// ==UserScript==
// @name         ChatGPT Yoimage VOICEVOX
// @namespace    http://tampermonkey.net/
// @version      2025-06-12.01
// @description  注意: http://127.0.0.1:50021/setting で、CORS Policy Modeを"all"にしておくこと。
// @author       @super_amateur_c どどど素人
// @match        https://chatgpt.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      raw.githubusercontent.com
// @run-at       document-end
// @noframes
// @updateURL    https://test.dodoneko.site/tempermonkey/ChatGPT Yoimage VOICEVOX.user.js
// @downloadURL  https://test.dodoneko.site/tempermonkey/ChatGPT Yoimage VOICEVOX.user.js
// @supportURL   https://www.twitter.com/super_amateur_c
// ==/UserScript==

const SCRIPT_ID = "ChatGPT Yoimage VOICEVOX".replace(/[\s\-]+/g, "_");

// content.js の先頭などで定義しておく
window.GM_xmlhttpRequest = function (details) {
    const {
        method = 'GET',
        url,
        data = null,
        headers = {},
        responseType = '',
        onload = () => { },
        onerror = () => { },
        onreadystatechange = () => { }
    } = details;

    fetch(url, {
        method,
        headers,
        body: data
    })
        .then(response => {
            // readyState 2: HEADERS_RECEIVED
            onreadystatechange({ readyState: 2, status: response.status, responseHeaders: response.headers });

            // readyState 3: LOADING
            onreadystatechange({ readyState: 3, status: response.status });

            if (!response.ok) {
                throw { status: response.status, statusText: response.statusText };
            }

            // レスポンスタイプに応じた処理
            const resPromise = (responseType === 'json')
                ? response.json().then(body => ({ response: body }))
                : response.text().then(body => ({ responseText: body }));

            return resPromise.then(resObj => {
                // readyState 4: DONE
                onreadystatechange({ readyState: 4, status: response.status });
                onload({
                    status: response.status,
                    statusText: response.statusText,
                    ...resObj
                });
            });
        })
        .catch(err => {
            onerror(err);
        });
};


function init() {
    createStyleElement();
    getYomiDicData();

    waitForHeaderAndInsertSettingsButton();
    loadSettings();

    observeChatGPTResponse();
}

const SETTINGS = {
    enabled: true,
    speakerId: 3, // ずんだもん（例）
    speed: 1.0,
    skipCodeBlock: true,
};

function createStyleElement() {
    createElement('style', {
        id: 'style',
        html: `

        `,
    });
}



var enToKanaDic = [];

function getYomiDicData() {
    let url = 'https://raw.githubusercontent.com/dododoshirouto/ZundaYomiageWinNotif/refs/heads/main/bep-eng.dic.txt';
    url += '?hash=' + new Date().getTime();
    GM_xmlhttpRequest({
        method: "GET",
        url: url,
        onload(res) {
            if (res.status === 200) {
                let data = res.responseText;
                enToKanaDic = data.split(/\n/).map(v => {
                    v = v.split(/\s/);
                    if (v.length < 2) {
                        return false;
                    }
                    return {
                        en: v[0],
                        kana: v[1],
                    };
                }).filter(v => v).sort((a, b) => b.en.length - a.en.length);
                console.log(enToKanaDic);
            } else {
                console.error("読み込み失敗:", res.status);
            }
        },
        onerror(err) {
            console.error("通信エラー", err);
        }
    });
}
function textEnToKana(text) {
    let result = text;
    enToKanaDic.forEach(v => {
        result = result.toUpperCase().replace(new RegExp(v.en.toUpperCase(), 'g'), v.kana);
    });
    return result;
}

// setting panel UI

var VV_CONNECTED = false;

function waitForHeaderAndInsertSettingsButton() {
    const interval = setInterval(() => {
        const target = document.querySelector('[role="presentation"] > .h-header-height'); // ChatGPTの上のヘッダーバー
        if (target && target.children[2]) {
            clearInterval(interval);
            const insertTarget = target.children[2];
            const settingsUI = createSettingsUI();
            insertTarget.prepend(settingsUI);
        }
    }, 500);
}

function createSettingsUI() {
    const wrapper = document.createElement('div');
    wrapper.style.marginLeft = '1em';

    const btn = createElement('button', {
        id: 'toggle-settings-button',
        class: ['settings-toggle-button'],
        html: '読み上げ',
        style: { padding: '4px 8px' }
    }, wrapper);

    const panel = createElement('div', {
        id: 'voicevox-settings-panel',
        style: {
            display: 'none',
            position: 'absolute',
            top: '3em',
            right: '1em',
            backgroundColor: '#222',
            color: '#fff',
            padding: '10px',
            border: '1px solid #555',
            zIndex: 9999
        },
        html: `
            <label><input type="checkbox" id="vv-enabled"> 読み上げ有効</label><br>
            <label>話者:
                <select id="vv-speaker" style="background:#333; color:white;"></select>
            </label><br>
            <label>スピード: <input type="range" id="vv-speed" min="0.5" max="2" step="0.1"></label>
            <span id="vv-speed-display"></span><br>
            <label><input type="checkbox" id="vv-skipcode"> コードブロックをスキップ</label><br>
            <button id="vv-reconnect" style="background:#8886; padding:1px 8px;"> VOICEVOXと再接続</button>
        `
    }, document.body);

    btn.addEventListener('click', () => {
        panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
    });

    const enabledInput = panel.querySelector('#vv-enabled');
    const speakerSelect = panel.querySelector('#vv-speaker');
    const speedInput = panel.querySelector('#vv-speed');
    const speedDisplay = panel.querySelector('#vv-speed-display');
    const skipCodeInput = panel.querySelector('#vv-skipcode');

    enabledInput.checked = SETTINGS.enabled;
    speedInput.value = SETTINGS.speed;
    speedDisplay.textContent = SETTINGS.speed;
    skipCodeInput.checked = SETTINGS.skipCodeBlock;

    // イベント
    enabledInput.addEventListener('change', () => {
        SETTINGS.enabled = enabledInput.checked;
        if (VV_CONNECTED) btn.innerHTML = (SETTINGS.enabled ? '🔊' : '🔇') + '読み上げ';
        else btn.innerHTML = '📵読み上げ';
        saveSettings();
    });

    speakerSelect.addEventListener('change', () => {
        SETTINGS.speakerId = parseInt(speakerSelect.value);
        saveSettings();
    });

    speedInput.addEventListener('input', () => {
        SETTINGS.speed = parseFloat(speedInput.value);
        speedDisplay.textContent = SETTINGS.speed;
        saveSettings();
    });

    skipCodeInput.addEventListener('change', () => {
        SETTINGS.skipCodeBlock = skipCodeInput.checked;
        saveSettings();
    });

    document.getElementById('vv-reconnect').addEventListener('click', () => {
        getVVSpeakers();
    });

    getVVSpeakers();

    return wrapper;
}

function getVVSpeakers() {
    let btn = document.getElementById('toggle-settings-button-' + SCRIPT_ID);
    if (!btn) {
        requestAnimationFrame(getVVSpeakers);
        return;
    }
    let speakerSelect = document.querySelector('#vv-speaker');
    // GM_xmlhttpRequestで話者取得
    GM_xmlhttpRequest({
        method: "GET",
        url: "http://127.0.0.1:50021/speakers",
        onload: function (res) {
            try {
                const speakers = JSON.parse(res.responseText);
                speakers.forEach(speaker => {
                    speaker.styles.forEach(style => {
                        const option = document.createElement('option');
                        option.value = style.id;
                        option.textContent = `${speaker.name}（${style.name}）`;
                        speakerSelect.appendChild(option);
                    });
                });

                // 現在の設定に合わせて初期値を選択
                speakerSelect.value = SETTINGS.speakerId;
                console.info('話者リストの読み込み成功');
                btn.innerHTML = (SETTINGS.enabled ? '🔊' : '🔇') + '読み上げ';
                VV_CONNECTED = true;
            } catch (e) {
                const option = document.createElement('option');
                option.textContent = '取得失敗';
                speakerSelect.appendChild(option);
                console.error('話者リストの読み込み失敗:', e);
                btn.innerHTML = '📵読み上げ';
                VV_CONNECTED = false;
            }
        },
        onerror: function (err) {
            const option = document.createElement('option');
            option.textContent = '取得失敗';
            speakerSelect.appendChild(option);
            console.error('話者リスト取得エラー:', err);
            console.log(btn);
            btn.innerHTML = '📵読み上げ';
            VV_CONNECTED = false;
        }
    });
}





// generate and play sounds

const CHATGPT_TALKBOX_QUERY = '.markdown.prose:not(.text-sm)';

let spokenText = "";
// let lastSpokenChat = "";
let unspokenBuffer = "";
/** @type {boolean} まだ再生中かどうか */
let isSpeaking = false;
/** @type {boolean} 前の生成が終わってるかどうか */
let isReadyForNext = true;

let lastTalkboxIndex = 0;
let lastTalktextIndex = 0;

const END_REGEX = /^.{1,}?[。！？」」．\.\?\!…]+/;

function observeChatGPTResponse() {
    const observer = new MutationObserver(() => {
        const latestResponse = document.querySelectorAll(CHATGPT_TALKBOX_QUERY);
        if (latestResponse.length === 0) {
            return;
        }

        checkNextSentence('observeChatGPTResponse');
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });
}

function chatGPTTextboxToText(elem) {
    const html = elem.innerHTML;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (SETTINGS.skipCodeBlock) {
        doc.querySelectorAll('pre, span[data-state="closed"], span[data-state="delayed-open"]').forEach(code => {
            code.remove();
        });
    }

    return doc.body.innerText.trim();
}

function checkNextSentence(ref) {
    console.log('checkNextSentence from', ref);

    if (!SETTINGS.enabled || !isReadyForNext) {
        // console.log("!SETTINGS.enabled || !isReadyForNext || isSpeaking");
        return;
    }

    const elems = document.querySelectorAll(CHATGPT_TALKBOX_QUERY);
    if (elems.length <= lastTalkboxIndex) {
        return;
    }
    if (elems.length - 1 > lastTalkboxIndex) {
        checkIfAllDone(1, true);
    }

    const currentText = chatGPTTextboxToText(elems[lastTalkboxIndex]);


    // console.log('lastSpokenChat', JSON.stringify(lastSpokenChat));
    if (currentText.trim().length <= lastTalktextIndex) {
        console.log("currentText.trim().length <= lastTalktextIndex", currentText.trim().length, lastTalktextIndex);
        return; // すでに読んだチャットだったら無視する
    }

    const diff = currentText.substr(spokenText.length);
    console.log('currentText', JSON.stringify(currentText));
    console.log('spokenText', JSON.stringify(spokenText));
    console.log('diff', JSON.stringify(diff));
    spokenText = currentText;

    if (spokenText == '​') { // ゼロハバクウハク
        checkIfAllDone(2);
        console.log('currentText.substr(0,spokenText.length) != spokenText');
        return;
    }

    unspokenBuffer += diff;
    console.log('unspokenBuffer', unspokenBuffer);

    const sentenceMatch = unspokenBuffer.replace(/\n/g, ' ').match(END_REGEX);
    if (diff == "" && !sentenceMatch && unspokenBuffer) {
        try { sentenceMatch = unspokenBuffer || ""; }
        catch (e) {
            console.error('sentenceMatch = unspokenBuffer || ""');
            console.error(e);
            console.error(sentenceMatch, unspokenBuffer);
        }
    }
    console.log('sentenceMatch', sentenceMatch);

    if (sentenceMatch) {
        const toSpeak = sentenceMatch[0].trim();
        unspokenBuffer = unspokenBuffer.replace(/\n/g, ' ').split(sentenceMatch[0]).at(1);

        // if (currentText.trim() !== "") lastSpokenChat += sentenceMatch[0];
        lastTalktextIndex += sentenceMatch[0].length;
        enqueueSpeak(toSpeak);
    }

    checkIfAllDone(3); // -
}

const speakQueue = [];
let isProcessingQueue = false;
let isFirstSentence = true;

function enqueueSpeak(text) {
    if (!text.trim()) return;
    speakQueue.push(text.trim());

    if (isFirstSentence) {
        // spokenText += text;
        isFirstSentence = false;
    }

    if (!isProcessingQueue) {
        isReadyForNext = false;
        processSpeakQueue();
    }
}



const audioURLQueue = [];

async function processSpeakQueue() {
    if (speakQueue.length === 0) {
        isProcessingQueue = false;
        return;
    }

    isProcessingQueue = true;
    let text = speakQueue.shift();
    text = textEnToKana(text);
    console.info('🔜 queue text', text);

    const speaker = SETTINGS.speakerId;
    const speed = SETTINGS.speed;

    try {
        // audio_query
        const queryRes = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `http://127.0.0.1:50021/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                responseType: 'json',
                onload: res => resolve(res.response),
                onerror: reject
            });
        });

        queryRes.speedScale = speed;
        queryRes.prePhonemeLength = 0.0;
        queryRes.postPhonemeLength = 0.0;

        // synthesis
        const synthRes = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `http://127.0.0.1:50021/synthesis?speaker=${speaker}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(queryRes),
                responseType: 'blob',
                onload: res => resolve(res.response),
                onerror: reject
            });
        });

        const audioURL = URL.createObjectURL(synthRes);
        audioURLQueue.push({ URL: audioURL, text: text });
        console.log('audioURLQueue.length ', audioURLQueue.length);
        isReadyForNext = true;     // 音声生成は完了！
        checkNextSentence('processSpeakQueue');       // 両方終わったかチェック
        setTimeout(playAudioQueue, 1);
        checkIfAllDone(5);
    } catch (err) {
        console.error('VOICEVOXキューエラー:', err);
        processSpeakQueue(); // 失敗しても続ける
    }
}

function playAudioQueue() {
    console.log('audioURLQueue.length ', audioURLQueue.length);
    if (isSpeaking || audioURLQueue.length == 0) {
        return;
    }

    let audios = audioURLQueue.shift();
    isSpeaking = true;

    const audio = new Audio(audios.URL);
    audio.onended = () => {
        console.info("finish play audio. : ", audios.URL);
        isSpeaking = false;
        playAudioQueue();
        checkNextSentence('audio.onended');  // 両方終わったかチェック
        checkIfAllDone(4); // +
    };
    console.info("🔊 start play audio. : ", audios.text);
    audio.play();
    processSpeakQueue();  // 次があれば生成
    playAudioQueue(); // 次があれば再生
}






function checkIfAllDone(id = 0, force = false) {
    const elems = document.querySelectorAll(CHATGPT_TALKBOX_QUERY);
    if (elems.length === 0) return;

    if (id == 3) {
        // console.log("🎉❌️ リセットしなかった", id);
        return;
    }

    const currentText = chatGPTTextboxToText(elems[elems.length - 1]);

    const allDone =
        speakQueue.length === 0 &&
        !isSpeaking &&
        unspokenBuffer === "" &&
        spokenText === currentText;

    if (allDone || force) {
        console.log("🎉 All done. リセットします", id);
        // debugger;
        spokenText = "";
        unspokenBuffer = "";
        isFirstSentence = true;
        lastTalkboxIndex++;
        lastTalktextIndex = 0;
    } else {
        // console.log("🎉❌️ リセットしなかった", id);
        return;
    }
}


function loadSettings() {
    document.cookie.split(';').forEach(cookie => {
        let [k, v] = cookie.trim().split('=');
        if (SETTINGS[k] !== undefined) {
            SETTINGS[k] = (k === 'enabled' || k === 'skipCodeBlock') ? v === 'true' : parseFloat(v);
        }
    });
}

function saveSettings() {
    for (let key in SETTINGS) {
        document.cookie = `${key}=${SETTINGS[key]}; path=/; max-age=31536000`;
    }
}

// toolbox functions

function createButton(name, parentQuery, onclick) {
    let id = SCRIPT_ID + name.replace(/\s+/g, '-');
    let parent = document.querySelector(parentQuery);
    console.log(name, parent, onclick);
    if (document.querySelector(id) || !parent) {
        setTimeout(_ => { createButton(name, parentQuery, onclick) }, 1);
        return;
    }
    let b = createElement('button', {
        html: name,
        id: id,
        class: 'gradio-button lg secondary svelte-cmf5ev tool'.split(' '),
    }, parent);
    b.addEventListener('click', onclick);
}

function copy(s) {
    try {
        let e = document;
        let t = e.createElement('textarea');
        t.value = s;
        e.body.appendChild(t);
        t.select();
        e.execCommand('copy');
        t.remove();
    } catch (e) {
        console.error('copy error.', e);
        return false;
    }
    return true;
}

function createElement(tag, options = { id: '', class: [], style: {}, html: "" }, parent = document.head) {
    let e = document.createElement(tag);
    for (let op in options) {
        let v = options[op];
        switch (op) {
            case 'id':
                e.id = `${v}-${SCRIPT_ID}`;
                break;
            case 'class':
                e.classList.add(...v);
                break;
            case 'style':
                for (let k in v) {
                    e.style[k] = v[k];
                }
                break;
            case 'html':
                e.innerHTML = myPolicy.createHTML(v);
                break;
            default:
                e[op] = v;
                break;
        }
    }
    parent.appendChild(e);
    return e;
}

/** @type {TrustedTypesPolicy} */
const myPolicy = trustedTypes
    ? trustedTypes.createPolicy("my-policy", {
        createHTML: (unsafeValue) => {
            return unsafeValue;
        },
    })
    : {
        createHTML: function (html) {
            return html;
        },
    };

window.addEventListener('load', init);



// test

async function speakText(text) {
    if (!SETTINGS.enabled || !text.trim()) return;

    const speaker = SETTINGS.speakerId;
    const speed = SETTINGS.speed;

    try {
        // ① audio_query取得
        const queryRes = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `http://127.0.0.1:50021/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                responseType: 'json',
                onload: res => resolve(res.response),
                onerror: reject
            });
        });

        // スピード設定
        queryRes.speedScale = speed;

        // ② synthesis（音声生成）
        const synthRes = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `http://127.0.0.1:50021/synthesis?speaker=${speaker}`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(queryRes),
                responseType: 'blob',
                onload: res => resolve(res.response),
                onerror: reject
            });
        });

        // ③ 再生
        const audioURL = URL.createObjectURL(synthRes);
        const audio = new Audio(audioURL);
        audio.play();

    } catch (err) {
        console.error('VOICEVOXエラー（CSPバイパス）:', err);
    }
}
