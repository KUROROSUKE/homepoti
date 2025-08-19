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

async function loginWithGoogle() {
  try {
    await auth.signInWithRedirect(provider);
  } catch (err) {
    console.error("Google login start failed:", err);
    alert("Googleログイン開始に失敗: " + err.message);
  }
}
window.loginWithGoogle = loginWithGoogle;

async function handleRedirectResultOnce() {
  try {
    const result = await auth.getRedirectResult();
    if (result && result.user) {
      console.log("Google login success:", result.user);
      await ensureUserProfile(result.user);
    }
  } catch (err) {
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
  if (user) {
    show("notSigned", false);
    show("viewScreen", true);
    text("UserNameTag", user.displayName || "名無し");
    try {
      await ensureUserProfile(user);
      await fetchMyPlayer();
      subscribePlayersList({ enable: false });
    } catch (e) {
      console.error("初期化中エラー:", e);
    }
  } else {
    show("viewScreen", false);
    show("notSigned", true);
  }
});

handleRedirectResultOnce();

/* ====== Realtime Database ユーティリティ ====== */
function myRef(uid) {
  return database.ref(`players/${uid}`);
}

async function ensureUserProfile(user) {
  const ref = myRef(user.uid);
  const snap = await ref.get();
  if (!snap.exists()) {
    const data = {
      Name: user.displayName || "",
      PhotoURL: user.photoURL || "",
      CreatedAt: firebase.database.ServerValue.TIMESTAMP,
      UpdatedAt: firebase.database.ServerValue.TIMESTAMP,
    };
    await ref.set(data);
  } else {
    await ref.update({ UpdatedAt: firebase.database.ServerValue.TIMESTAMP });
  }
}

async function fetchMyPlayer() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const ref = myRef(user.uid);
    const snap = await ref.get();
    if (snap.exists()) {
      const val = snap.val();
      console.log("my player:", val);
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

window.DB = {
  loginWithGoogle,
  logout,
  fetchMyPlayer,
  updateMyPlayer,
  subscribePlayersList,
};
