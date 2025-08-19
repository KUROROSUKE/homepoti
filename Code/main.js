
let delay_time = 10; //10秒たつまで再投稿はできない

// ============ indexedDB actions ============
const DB_NAME = "homepoti_DB";
const STORE_NAME = "homepoti_Store";
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = (event) => reject("DB open error");
        request.onsuccess = (event) => resolve(event.target.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            };
        };
    });
}
async function setItem(key, value) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    return tx.complete;
}
async function getItem(key) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject("Get error");
    });
}



const textInput = document.getElementById('postTextInput');
const charCount = document.getElementById('charCount');

textInput.addEventListener('input', function () {
    const count = this.value.length;
    charCount.textContent = count;

    if (count > 250) {
        charCount.style.color = '#f91880'; // 赤
    } else if (count > 0) {
        charCount.style.color = '#1d9bf0'; // 青
    } else {
        charCount.style.color = '#999';    // グレー
    }

    // オートリサイズ
    this.style.height = 'auto';
    this.style.height = Math.max(36, this.scrollHeight) + 'px';
});






async function viewImageCanvas(maxLong=300) {
    // ここでのmaxLongはテストで表示するcanvasの大きさ
    file = document.getElementById("fileInput").files[0];
    console.log(file);

    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = URL.createObjectURL(file);
    });

    let w = img.width, h = img.height;
    const isWLong = w >= h;
    const ratio = isWLong ? Math.min(1, maxLong / w) : Math.min(1, maxLong / h);
    const nw = Math.max(1, Math.round(w * ratio));
    const nh = Math.max(1, Math.round(h * ratio));

    const canvas = document.getElementById("canvas");
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, nw, nh);
    canvas.style.display = "block";
}



// アップロード時に画像の容量を落とす。
// fileInput(id)に画像が選択されてる前提で動作
// blob形式のデータを返す
// canvasの削除を行う
async function resizeImage(maxLong=640) {
    const file = document.getElementById("fileInput").files[0];
    if (!file) return null;

    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = URL.createObjectURL(file);
    });

    let w = img.width, h = img.height;
    const isWLong = w >= h;
    const ratio = isWLong ? Math.min(1, maxLong / w) : Math.min(1, maxLong / h);
    const nw = Math.max(1, Math.round(w * ratio));
    const nh = Math.max(1, Math.round(h * ratio));

    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    // ここで確実に目的サイズへ描画
    canvas.width = nw;
    canvas.height = nh;
    ctx.drawImage(img, 0, 0, nw, nh);

    const blob = await new Promise((res) =>
        canvas.toBlob(res, "image/jpeg", 0.9)
    );

    // 後片付け
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0; canvas.height = 0;
    canvas.style.display = "none";

    return blob;
}


async function post() {
    // NoSQLサーバーへアップロードする。
    // ファイルは最大で画像1枚（500KBくらいに圧縮して送りたい）
    // 文章は最大で200文字かな

    // テキスト入力
    const TextInputTag = document.getElementById("postTextInput")
    const content_text = TextInputTag.value;
    if (content_text.length == 0) {alert("テキストを入れてください"); return}
    
    //画像入力
    const ImageInputTag = document.getElementById("fileInput");
    const blob_image =  ImageInputTag.files[0] ? await resizeImage() : null;   //もし画像があれば、リサイズしてcanvasの方は消す。

    // ここはイメージ。あとで実装。
    upload(content_text, blob_image);

    // 使ったところを消しておく
    TextInputTag .value = "";
    ImageInputTag.value = "";
    
    const count = textInput.value.length;
    charCount.textContent = count;
    charCount.style.color = '#1d9bf0'; // 青
    // オートリサイズ
    textInput.style.height = 'auto';
    textInput.style.height = Math.max(36, textInput.scrollHeight) + 'px';
}








const Follow_uid_list = ["I5wUbCT8cXRdwjXjSTI4ORJzoWh1"]


async function getRecentFollowerPostIds(followerUids) {
    if (!followerUids || followerUids.length === 0) return [];

    const collected = [];

    await Promise.all(followerUids.map(async (uid) => {
        const snap = await database.ref(`players/${uid}/posts`).get();
        if (!snap.exists()) return;

        snap.forEach(child => {
            const val = child.val() || {};
            if (val.text && val.text.trim().length > 0) {
                collected.push({
                    postId: child.key,
                    createdAt: typeof val.createdAt === "number" ? val.createdAt : 0
                });
            }
        });
    }));

    // 全体をcreatedAt降順に並べて10件だけpostIdを返す
    collected.sort((a, b) => b.createdAt - a.createdAt);
    return collected.slice(0, 10).map(item => item.postId);
}


async function toViewScreen() {
    // NoSQLサーバーから最近の投稿をとってくる
    // uid と postId は保存時のものを渡す
    //loadImageFromRTDBの、すべての引数を自動で決定してほしい。いったん対象をすべてに広げて。

    (await getRecentFollowerPostIds(Follow_uid_list)).forEach((postId, n) => {
        const post_div = document.createElement("div");
        post_div.id = `post_${n}`;
        post_div.style.width = "100%";
        post_div.style.height = "auto";
        post_div.style.border = "1px solid #000";

        const img_tag = document.createElement("img");
        img_tag.alt = "base64 image";
        let img_tag_id = `img_${n}`;
        img_tag.id = img_tag_id;

        const text_tag = document.createElement("p");
        let txt_tag_id = `txt_${n}`;
        text_tag.id = txt_tag_id

        loadFromRTDB(postId, Follow_uid_list[0], img_tag_id, txt_tag_id).catch(console.error);
        img_tag.width  = 200;
        img_tag.height = 200;

        post_div.appendChild(text_tag);
        if (img_tag.src !== "") post_div.appendChild(img_tag);
        document.getElementById("viewScreen").appendChild(post_div);
    })
}


// コインと価値の実装
// UIの改善
