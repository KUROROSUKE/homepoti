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







const Follow_uid_list = ["I5wUbCT8cXRdwjXjSTI4ORJzoWh1", "ykeRda4HA6e6Byhn1nqad8Tpwv92"]
const shownPostIds = new Set();

// ===== ページネーション用の状態 =====
let oldestLoadedTime = null;           // 画面にある中で最も古い createdAt
const postsPerPage = 10;               // 1回の読み込み件数
const LOAD_DELAY_MS = 1500;            // 連打防止の待ち
const loadMoreBtn = document.getElementById("loadMoreBtn");

// === 追加: 下端判定ユーティリティ（1px余裕） ===
const viewScreen = document.getElementById("viewScreen");
function isAtBottom(el) {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
}

/**
 * 全件取得してローカルでフィルタ＆ソート（インデックス不要）:contentReference[oaicite:3]{index=3}
 * beforeTime が null のときは最新から limit 件。
 * beforeTime が数値のときは createdAt < beforeTime の範囲から limit 件（＝今より次に古い塊）。
 */
async function collectMergedPage(followerUids, beforeTime, limit = postsPerPage) {
    if (!followerUids || followerUids.length === 0) return [];
    const collected = [];

    await Promise.all(followerUids.map(async (uid) => {
        const snap = await database.ref(`players/${uid}/posts`).get(); // orderByChildは使わない
        if (!snap.exists()) return;

        snap.forEach(child => {
            const val = child.val() || {};
            if (!val || !val.text || !val.text.trim()) return;
            const ts = typeof val.createdAt === "number" ? val.createdAt : 0;
            if (beforeTime == null || ts < beforeTime) {
                collected.push({ uid, postId: child.key, createdAt: ts });
            }
        });
    }));

    // 降順（新しい→古い）で並べ、上から limit 件だけ返す
    collected.sort((a, b) => b.createdAt - a.createdAt);
    return collected.slice(0, limit);
}

function attachPostStreamForUid(uid) {
    const query = database
        .ref(`players/${uid}/posts`)
        .limitToLast(1); // 最新1件だけ監視（orderByChild不要で既定キー順）

    const handler = (snap) => {
        const postId = snap.key;
        if (!postId) return;
        if (shownPostIds.has(postId)) return;

        // 新規は上に挿入
        renderPost(postId, uid, 'top');
    };

    query.on('child_added', handler);
}

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
                    uid, // 追加
                    postId: child.key,
                    createdAt: typeof val.createdAt === "number" ? val.createdAt : 0
                });
            }
        });
    }));
    // 全体をcreatedAt降順に並べて10件だけ返す
    collected.sort((a, b) => b.createdAt - a.createdAt);
    return collected.slice(0, 10).map(item => ({
        uid: item.uid,
        postId: item.postId
    }));
}


/**
 * コメント送信
 *  - ownerUid: 投稿の所有者UID
 *  - postId  : 対象投稿ID
 */
async function submitComment(ownerUid, postId, inputEl, buttonEl) {
    const user = auth.currentUser;
    if (!user) { alert("ログインしてください"); return; }

    const text = (inputEl.value || "").trim();
    if (!text) return;

    buttonEl.disabled = true;
    try {
        const ref = database.ref(`players/${ownerUid}/posts/${postId}/comments`).push();
        const payload = {
            id: ref.key,
            uid: user.uid,
            name: window.currentUserName || "anonymous", // ★ connectDBでセット
            text,
            createdAt: Date.now(),
        };
        await ref.set(payload);
        inputEl.value = "";
    } catch (e) {
        console.error(e);
        alert("コメントの送信に失敗しました");
    } finally {
        buttonEl.disabled = false;
    }
}

/**
 * コメントのリアルタイム購読
 */
function attachCommentsStream(ownerUid, postId, listEl) {
    const ref = database.ref(`players/${ownerUid}/posts/${postId}/comments`).limitToLast(50);
    ref.on("child_added", (snap) => {
        const v = snap.val() || {};
        const item = document.createElement("div");
        item.className = "comment-item";

        const meta = document.createElement("div");
        meta.className = "comment-meta";
        meta.textContent = v.name ? v.name : "匿名";

        const body = document.createElement("div");
        body.className = "comment-body";
        // textContent なのでXSS対策としてプレーンテキスト表示
        body.textContent = v.text || "";

        item.appendChild(meta);
        item.appendChild(body);
        listEl.appendChild(item);
    });
}


// === 追加: コイン付与に関する定義 ===
const COIN_FOR_GIVER = 1;     // 褒めた人
const COIN_FOR_RECEIVER = 1;  // 褒められた人

async function awardCoinsForPraise(ownerUid, likerUid) {
    // 取り消し時は別関数で減算
    await Promise.all([
        database.ref(`players/${ownerUid}/coins`).transaction((cur) => {
            const v = typeof cur === "number" ? cur : 0;
            return v + COIN_FOR_RECEIVER;
        }),
        database.ref(`players/${likerUid}/coins`).transaction((cur) => {
            const v = typeof cur === "number" ? cur : 0;
            return v + COIN_FOR_GIVER;
        }),
    ]);
}

async function revertCoinsForPraise(ownerUid, likerUid) {
    await Promise.all([
        database.ref(`players/${ownerUid}/coins`).transaction((cur) => {
            const v = typeof cur === "number" ? cur : 0;
            const nv = v - COIN_FOR_RECEIVER;
            return nv < 0 ? 0 : nv;
        }),
        database.ref(`players/${likerUid}/coins`).transaction((cur) => {
            const v = typeof cur === "number" ? cur : 0;
            const nv = v - COIN_FOR_GIVER;
            return nv < 0 ? 0 : nv;
        }),
    ]);
}


/**
 * position:
 *  - 'top'    : 先頭へ挿入（新規投稿など）
 *  - 'bottom' : 末尾へ追加（過去ロード）
 */
async function renderPost(postId, uid, position = 'top') {
    let n = shownPostIds.size;

    const post_div = document.createElement("div");
    post_div.id = `post_${n}`;
    post_div.style.width = "calc(100% - 20px)";
    post_div.style.height = "auto";
    post_div.style.border = "1px solid #000";
    post_div.style.margin = "0 5px 0 5px";
    post_div.style.padding = "10px";
    post_div.style.position = "relative"; // ★ 追加: 褒めるボタンの絶対配置用

    // ★★★ 追加: 褒めるボタンUI + ロジック ★★★
    const praiseBtn = document.createElement("button");
    praiseBtn.className = "praise-btn";
    praiseBtn.textContent = "褒める ";

    const praiseCount = document.createElement("span");
    praiseCount.className = "praise-count";
    praiseCount.textContent = "0";
    praiseBtn.appendChild(praiseCount);

    // DB参照（この投稿のpraises配下）
    const praisesRef = database.ref(`players/${uid}/posts/${postId}/praises`);

    // リアルタイム購読で人数と自分の状態を反映
    praisesRef.on("value", (snap) => {
        const v = snap.val() || {};
        const cnt = Object.keys(v).length;
        praiseCount.textContent = String(cnt);
        const cu = auth.currentUser;
        if (cu && v[cu.uid]) {
            praiseBtn.classList.add("active");
        } else {
            praiseBtn.classList.remove("active");
        }
    });

    // トグル挙動（transactionで二重加算を抑止）
    praiseBtn.addEventListener("click", async () => {
        const cu = auth.currentUser;
        if (!cu) { alert("ログインしてください"); return; }
        const myRef = praisesRef.child(cu.uid);

        try {
            const result = await myRef.transaction((curr) => {
                // 既に褒めているなら取り消し(null)、そうでなければ褒める(true)
                return curr ? null : true;
            });
            if (!result.committed) return;

            // 反映後の値を見て、付与か減算かを判断
            const afterVal = result.snapshot.val();
            if (afterVal === true) {
                await awardCoinsForPraise(uid, cu.uid);
            } else {
                await revertCoinsForPraise(uid, cu.uid);
            }
        } catch (e) {
            console.error(e);
            alert("操作に失敗しました");
        }
    });

    // 先にボタンを右上へ配置
    post_div.appendChild(praiseBtn);

    const img_tag = document.createElement("img");
    img_tag.alt = "base64 image";
    img_tag.id  = `img_${n}`;

    const text_tag = document.createElement("p");
    text_tag.id = `txt_${n}`;

    await loadFromRTDB(postId, uid, img_tag, text_tag).catch(console.error);

    // ← JSでの width/height 指定は不要。CSSで制御。
    post_div.appendChild(text_tag);
    if (img_tag.src) post_div.appendChild(img_tag);

    // ★ 追加: コメントUI
    const commentsWrap = document.createElement("div");
    commentsWrap.className = "comments";

    const list = document.createElement("div");
    list.className = "comment-list";
    commentsWrap.appendChild(list);

    const form = document.createElement("div");
    form.className = "comment-form";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "コメントを書く";
    input.maxLength = 200;
    input.className = "comment-input";

    const sendBtn = document.createElement("button");
    sendBtn.textContent = "送信";
    sendBtn.className = "comment-send";
    sendBtn.addEventListener("click", () => submitComment(uid, postId, input, sendBtn));

    form.appendChild(input);
    form.appendChild(sendBtn);
    commentsWrap.appendChild(form);

    post_div.appendChild(commentsWrap);

    // コメントのストリーム購読開始
    attachCommentsStream(uid, postId, list);

    const container = document.getElementById("viewScreen");
    if (position === 'top' && container.firstChild) {
        container.insertBefore(post_div, container.firstChild);
    } else {
        container.appendChild(post_div);
    }

    shownPostIds.add(postId);
}


/**
 * 初期ロード:
 *   最新から limit 件を降順で取得し、その順で末尾追加。
 *   → 画面全体は上が新しい、下が古い。
 *   最後に oldestLoadedTime を画面内の最小 createdAt に更新。
 * 既存の toViewScreen 名は connectDB.js から呼ばれるため維持:contentReference[oaicite:4]{index=4}:contentReference[oaicite:5]{index=5}
 */
async function toViewScreen() {
    const page = await collectMergedPage(Follow_uid_list, null, postsPerPage);
    if (page.length === 0) {
        loadMoreBtn.style.display = "none";
        return;
    }

    // 降順（新しい→古い）でそのまま末尾へ追加
    for (let i = 0; i < page.length; i++) {
        const { postId, uid } = page[i];
        await renderPost(postId, uid, 'bottom');
    }

    // 画面中の最も古い createdAt を保持
    oldestLoadedTime = page[page.length - 1].createdAt;

    // 追加: 初期表示は下端に居るかどうかでボタン表示を決める
    loadMoreBtn.style.display = isAtBottom(viewScreen) ? "block" : "none";
}

// 「さらに読み込む」: 今の最古よりさらに古い塊を取得して末尾に追加
loadMoreBtn.addEventListener("click", async () => {
    if (loadMoreBtn.disabled) return;

    // 追加: クリック時点で下端にいたかを記録
    const wasAtBottom = isAtBottom(viewScreen);

    loadMoreBtn.disabled = true;
    const prevLabel = loadMoreBtn.textContent;
    loadMoreBtn.textContent = "読み込み中...";

    try {
        const page = await collectMergedPage(Follow_uid_list, oldestLoadedTime, postsPerPage);
        if (page.length === 0) {
            loadMoreBtn.textContent = "これ以上ありません";
            // 下端に居るときだけ見せるルールを維持
            loadMoreBtn.style.display = isAtBottom(viewScreen) ? "block" : "none";
            return;
        }

        // 取得したページを降順で末尾追加
        for (let i = 0; i < page.length; i++) {
            const { postId, uid } = page[i];
            await renderPost(postId, uid, 'bottom');
        }

        // 次の基準を更新（今回ページ内で最も古い）
        oldestLoadedTime = page[page.length - 1].createdAt;

        // 追加: 事前に下端だった場合は追従して下端へスクロール維持
        if (wasAtBottom) {
            viewScreen.scrollTop = viewScreen.scrollHeight - viewScreen.clientHeight;
        }

        loadMoreBtn.textContent = prevLabel;

        // 追加: 追従後に表示可否を再評価
        loadMoreBtn.style.display = isAtBottom(viewScreen) ? "block" : "none";
    } catch (e) {
        console.error(e);
        loadMoreBtn.textContent = "エラー。再試行";
        // エラー時も現在のスクロール位置に合わせて可視制御
        loadMoreBtn.style.display = isAtBottom(viewScreen) ? "block" : "none";
    } finally {
        setTimeout(() => { loadMoreBtn.disabled = false; }, LOAD_DELAY_MS);
    }
});



// コインと価値の実装
// UIの改善
// ====== スクロール位置による「さらに読み込む」制御 ======
viewScreen.addEventListener("scroll", () => {
    const nearBottom = isAtBottom(viewScreen);
    if (nearBottom) {
        loadMoreBtn.style.display = "block";
    } else {
        loadMoreBtn.style.display = "none";
    }
});
