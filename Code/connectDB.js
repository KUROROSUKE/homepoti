
// ============ authentication      ============
// firebase Realtime DB config
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
const database = firebase.database();
const auth = firebase.auth();
function getRandomName() {
    const animals = ["cat", "dog", "bird", "bear", "monkey", "fox", "deer", "penguin"];
    const rand = animals[Math.floor(Math.random() * animals.length)] + Math.floor(Math.random() * 1000);
    return rand;
}
auth.onAuthStateChanged(async (authUser) => {
    if (!authUser) return;

    const playerRef = database.ref(`players/${authUser.uid}`);
    const snapshot  = await playerRef.once('value');
    let name = snapshot.child('Name').val();

    // もしデータに自分の情報がない -> はじめてサインインしたなら
    if (!snapshot.exists()) {
        name = getRandomName();
        await playerRef.set({
            Name       : name,
        });
    } else if (!name) { // 名前だけがないなら
        name = getRandomName();
        await playerRef.update({ Name: name, IsSearched: false });
    }

    // 最初の画面反映
    //TODO: document.getElementById('UserNameTag').textContent = `名前： ${name}`;
    document.getElementById('viewScreen').style.display = 'block';
    document.getElementById('notSigned' ).style.display = 'none';

    // 全体のリアルタイム更新監視
    const playersRef = database.ref('players/');
    playersRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            // 家族内の投稿を監視・追加
            const data = snapshot.val();

            const playersArray = Object.entries(data).map(([userId, playerData]) => ({
                userId,
                name: playerData.Name || "名無し",
                rate: playerData.Rate || 0
            }));

        } else {
            console.log("プレイヤーデータが存在しません");
        }
    }, (error) => {
        console.error("データ取得エラー:", error);
    });
});
function logout() {
    auth.signOut();
    document.getElementById("viewScreen").style.display = "none";
    document.getElementById("postScreen").style.display = "none";
    document.getElementById("notSigned" ).style.display = "block";
}
// Google login
const provider = new firebase.auth.GoogleAuthProvider();

// 端末と環境判定
function isMobileUA() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua);
}
function isInAppBrowserUA() {
  const ua = navigator.userAgent || "";
  // 代表的なアプリ内ブラウザ
  return /FBAN|FBAV|Instagram|Line|MicroMessenger|Twitter/i.test(ua);
}

async function loginWithGoogle() {
  // モバイル or アプリ内ブラウザは最初から redirect が安定
  const preferRedirect = isMobileUA() || isInAppBrowserUA();

  try {
    if (preferRedirect) {
      // redirect 開始
      sessionStorage.setItem("authRedirecting", "1"); // 進行中フラグ（任意）
      await auth.signInWithRedirect(provider);
      return;
    }

    // まずは PC で popup を試す
    await auth.signInWithPopup(provider);
  } catch (e) {
    // popup がブロック・環境非対応などは redirect へ切替
    const fallbackCodes = new Set([
      "auth/operation-not-supported-in-this-environment",
      "auth/popup-blocked",
      "auth/popup-closed-by-user",
      "auth/cancelled-popup-request"
    ]);
    if (fallbackCodes.has(e.code)) {
      sessionStorage.setItem("authRedirecting", "1");
      await auth.signInWithRedirect(provider);
      return;
    }
    // それ以外は表面化
    console.error("Google login failed:", e);
    alert("ログインに失敗: " + (e && e.message ? e.message : e));
  }
}


// Sign up with email & password
function SignUpWithMail() {
    const email = prompt("メールアドレスを入力してください:");
    const password = prompt("パスワードを入力してください（6文字以上）:");
    
    if (!email || !password) {
        alert("メールアドレスとパスワードを入力してください");
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
        const user = userCredential.user;
        console.log("サインアップ成功:", user);
        alert("サインアップ成功しました");
        startPeer(); // optional if you want to start after signup
    })
    .catch((error) => {
        console.error("サインアップ失敗:", error);
        alert("サインアップに失敗しました: " + error.message);
    });
}
// Login with email & password
function loginWithMail() {
    const email = prompt("メールアドレスを入力してください:");
    const password = prompt("パスワードを入力してください:");
    
    if (!email || !password) {
        alert("メールアドレスとパスワードを入力してください");
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
        const user = userCredential.user;
        console.log("ログイン成功:", user);
        alert("ログイン成功しました");
        document.getElementById("LoginModal").style.display = "none";
        document.getElementById("UserDataModal").style.display = "block";
        startPeer(); // optional if you want to start after login
    })
    .catch((error) => {
        console.error("ログイン失敗:", error);
        alert("ログインに失敗しました: " + error.message);
    });
}

