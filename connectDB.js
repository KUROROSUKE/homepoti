/* =========================
 *  connectDB.js  (Firebase v9 compat)
 *  - Googleサインインは Redirect 方式
 *  - /players/$uid へ自分のデータを読書き
 *  - 一覧購読はオプション（rulesに応じてON/OFF）
 *  依存: index.html で以下を読み込み済み
 *    firebase-app-compat.js
 *    firebase-auth-compat.js
 *    firebase-database-compat.js
 *    firebase-storage-compat.js（使わないなら省略可）
 * ========================= */

/* ===== Firebase 初期化 ===== */
const firebaseConfig = {
  apiKey: "AIzaSyBE8CK6ODzy0OrgPogLrE4IK9938rUF3ko",
  authDomain: "homepoti-b61a7.firebaseapp.com",
  databaseURL: "https://homepoti-b61a7-default-rtdb.firebaseio.com",
  projectId: "homepoti-b61a7",
  storageBucket: "homepoti-b61a7.firebasestorage.app",
  messagingSenderId: "379862558289",
  appId: "1:379862558289:web:a8f40e857d5ade3f35ba70",
  measurementId: "G-W52MY9CN8L",
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const database = firebase.database();

/* ===== DOM ヘルパ ===== */
function qs(id) { return document.getElementById(id); }
function show(id, v=true){ const el = qs(id); if(el) el.style.display = v ? "block":"none"; }
function text(id, s){ const el = qs(id); if(el) el.textContent = s; }

/* ===== 認証（Redirect 方式） ===== */
const provider = new firebase.auth.GoogleAuthProvider();
// 必要ならスコープを追加
// provider.addScope('profile');

async function loginWithGoogle() {
  try {
    await auth.signInWithRedirect(provider);
  } catch (err) {
    console.error("Google login start failed:", err);
    alert("Googleログイン開始に失敗: " + err.message);
  }
}

// index.html のボタンから呼ぶ想定
window.loginWithGoogle = loginWithGoogle;

async function handleRedirectResultOnce() {
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      console.log("Google login success:", result.user);
      // 初回ユーザーならプロファイルを作成
      await ensureUserProfile(result.user);
    }
  } catch (err) {
    // COOP/COEP 環境での window.close 警告は無視してよい
    console.error("Google login failed:", err);
  }
}

/* ===== サインアウト ===== */
async function logout() {
  await auth.signOut();
}
window.logout = logout;

/* ===== 認証状態監視 ===== */
auth.onAuthStateChanged(async (user) => {
  // 画面切り替え
  if (user) {
    show("notSigned", false);
    show("viewScreen", true);
    text("UserNameTag", user.displayName || "名無し");
    try {
      await ensureUserProfile(user);
      // 自分のデータ読み込み例
      await fetchMyPlayer();
      // 一覧購読が必要なら有効化（rulesが親.readを許す場合のみ）
      subscribePlayersList({ enable: false }); // 一覧が要るなら true に
    } catch (e) {
      console.error("初期化中エラー:", e);
    }
  } else {
    show("viewScreen", false);
    show("notSigned", true);
  }
});

// リロード直後のリダイレクト結果回収
handleRedirectResultOnce();

/* ====== Realtime Database ユーティリティ ====== */

// 自分用のノード参照
function myRef(uid) {
  return database.ref(`players/${uid}`);
}

// 初回保存（なければ作る）
async function ensureUserProfile(user) {
  const ref = myRef(user.uid);
  const snap = await ref.get();
  if (!snap.exists()) {
    const data = {
      Name: user.displayName || "",
      PhotoURL: user.photoURL || "",
      CreatedAt: firebase.database.ServerValue.TIMESTAMP,
      UpdatedAt: firebase.database.ServerValue.TIMESTAMP,
      // 必要な初期フィールドをここに追加
    };
    await ref.set(data);
  } else {
    // 最終更新だけ更新したい場合
    await ref.update({ UpdatedAt: firebase.database.ServerValue.TIMESTAMP });
  }
}

// 自分のデータを読む
async function fetchMyPlayer() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const ref = myRef(user.uid);
    const snap = await ref.get(); // permission_denied の場合は rules を確認
    if (snap.exists()) {
      const val = snap.val();
      console.log("my player:", val);
      // 例: 画面に反映
      text("MyNameTag", val.Name || "");
    } else {
      console.log("my player: empty");
    }
  } catch (err) {
    console.error("データ取得エラー:", err);
    alert("自分のデータ取得に失敗: " + err.message);
  }
}
window.fetchMyPlayer = fetchMyPlayer;

// 自分のデータを書き込む例
async function updateMyPlayer(partial) {
  const user = auth.currentUser;
  if (!user) return;
  const ref = myRef(user.uid);
  await ref.update({
    ...partial,
    UpdatedAt: firebase.database.ServerValue.TIMESTAMP,
  });
}
window.updateMyPlayer = updateMyPlayer;

// 一覧購読（必要な場合のみ）
// ルール例:
// {
//   "rules": {
//     "players": {
//       ".read": "auth != null",                // 一覧が必要なら親のreadを許可
//       ".write": false,
//       "$uid": {
//         ".write": "auth != null && auth.uid === $uid"
//       }
//     }
//   }
// }
let playersUnsub = null;
function subscribePlayersList({ enable = false } = {}) {
  if (!enable) {
    if (playersUnsub) { playersUnsub(); playersUnsub = null; }
    return;
  }
  const ref = database.ref("players");
  const handler = (snap) => {
    if (!snap.exists()) { renderPlayers([]); return; }
    const obj = snap.val();
    const arr = Object.entries(obj).map(([uid, v]) => ({
      uid,
      name: v?.Name || "",
      photoURL: v?.PhotoURL || "",
      updatedAt: v?.UpdatedAt || 0,
    })).sort((a,b)=> b.updatedAt - a.updatedAt);
    renderPlayers(arr);
  };
  ref.on("value", handler, (err) => {
    console.error("一覧購読エラー:", err);
    alert("一覧購読に失敗: " + err.message);
  });
  playersUnsub = () => ref.off("value", handler);
}

// 画面描画の例。必要に応じて置き換え
function renderPlayers(list) {
  const el = qs("PlayersList");
  if (!el) return;
  el.innerHTML = "";
  list.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.name || p.uid;
    el.appendChild(li);
  });
}

/* ===== パブリックな一覧が必要なら別ツリーを使う =====
 * DBルールを厳しくする場合は、公開してよい最小データを
 * /publicPlayers に複製して、親.readを公開（認証不要）にする。
 * 例:
 * {
 *   "rules": {
 *     "publicPlayers": { ".read": true, ".write": false },
 *     "players": {
 *       "$uid": {
 *         ".read": "auth != null && auth.uid === $uid",
 *         ".write":"auth != null && auth.uid === $uid"
 *       }
 *     }
 *   }
 * }
 * その場合は subscribePublicPlayers() を使う。
 */
function subscribePublicPlayers({ enable = false } = {}) {
  if (!enable) return;
  const ref = database.ref("publicPlayers");
  ref.on("value", (snap) => {
    if (!snap.exists()) { renderPlayers([]); return; }
    const obj = snap.val() || {};
    const arr = Object.entries(obj).map(([uid, v]) => ({
      uid,
      name: v?.Name || "",
      updatedAt: v?.UpdatedAt || 0,
    })).sort((a,b)=> b.updatedAt - a.updatedAt);
    renderPlayers(arr);
  }, (err)=> console.error("public一覧エラー:", err));
}
window.subscribePublicPlayers = subscribePublicPlayers;

/* ===== 便利関数をエクスポート（global） ===== */
window.DB = {
  loginWithGoogle,
  logout,
  fetchMyPlayer,
  updateMyPlayer,
  subscribePlayersList,
};
