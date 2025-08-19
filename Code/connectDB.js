// ============ authentication      ============
// firebase Realtime DB config
const firebaseConfig = {
    apiKey: "AIzaSyBE8CK6ODzy0OrgPogLrE4IK9938rUF3ko",
    authDomain: "homepoti-b61a7.firebaseapp.com",
    databaseURL: "https://homepoti-b61a7-default-rtdb.firebaseio.com",
    projectId: "homepoti-b61a7",
    storageBucket: "homepoti-b61a7.appspot.com",
    messagingSenderId: "379862558289",
    appId: "1:379862558289:web:a8f40e857d5ade3f35ba70",
    measurementId: "G-W52MY9CN8L",
};
firebase.initializeApp(firebaseConfig);

// ← 明示しておく（ReferenceError対策）
const db = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();

function getRandomName() {
    const animals = ["cat", "dog", "bird", "bear", "monkey", "fox", "deer", "penguin"];
    const rand = animals[Math.floor(Math.random() * animals.length)] + Math.floor(Math.random() * 1000);
    return rand;
}

auth.onAuthStateChanged(async (authUser) => {
    if (!authUser) return;

    const playerRef = db.ref(`players/${authUser.uid}`);
    const snapshot  = await playerRef.once('value');
    let name = snapshot.child('Name').val();

    if (!snapshot.exists()) {
        name = getRandomName();
        await playerRef.set({ Name: name });
    } else if (!name) {
        name = getRandomName();
        await playerRef.update({ Name: name, IsSearched: false });
    }

    // 最初の画面反映
    document.getElementById('viewScreen').style.display = 'block';
    document.getElementById("bottomNav") .style.display = "flex";
    document.getElementById('notSigned' ).style.display = 'none';

    // 家族一覧の購読（必要なら実装を拡張）
    const playersRef = db.ref('players/');
    playersRef.on('value', (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        const playersArray = Object.entries(data).map(([userId, playerData]) => ({
            userId,
            name: playerData.Name || "名無し",
        }));
        // TODO: UI反映
    }, (error) => {
        console.error("データ取得エラー:", error);
    });
});

// Google login
function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
    .then((result) => {
        const user = result.user;
        console.log("Google login success:", user);
        const lm = document.getElementById("LoginModal");
        const um = document.getElementById("UserDataModal");
        if (lm) lm.style.display = "none";
        if (um) um.style.display = "block";
        if (typeof startPeer === "function") startPeer();
    })
    .catch((error) => {
        console.error("Google login failed: ", error);
        alert("Googleログインに失敗しました");
    });
}
function logout() {
    auth.signOut();
    document.getElementById("viewScreen").style.display = "none";
    document.getElementById("bottomNav") .style.display = "none";
    document.getElementById("postScreen").style.display = "none";
    document.getElementById("notSigned" ).style.display = "block";
}

/**
 * 投稿を players/{uid}/posts/{postId} に保存。
 * image_data は以下のいずれか:
 *  - null（画像なし）
 *  - Blob（main.js の resizeImage() 結果）
 *  - string（すでに持っているダウンロードURL）
 */
async function upload(text_data, image_data) {
    const user = auth.currentUser;
    if (!user) { alert("ログインしてください"); return; }

    // 先に postId を採番
    const postsRoot = db.ref(`players/${user.uid}/posts`);
    const postRef   = postsRoot.push();
    const postId    = postRef.key;

    // 画像が Blob or Promise<Blob> の場合は Storage にアップロードして URL 化
    let imageURL = null;
    try {
        const maybeBlob = (image_data && typeof image_data.then === "function")
            ? await image_data
            : image_data;
        if (maybeBlob instanceof Blob) {
            const path = `posts/${user.uid}/${postId}.jpg`;
            const sref = storage.ref().child(path);
            await sref.put(maybeBlob, { contentType: "image/jpeg" });
            imageURL = await sref.getDownloadURL();
        } else if (typeof maybeBlob === "string") {
            imageURL = maybeBlob; // 既存URL
        }
    } catch (e) {
        console.error("画像アップロード失敗:", e);
        alert("画像アップロードに失敗しました: " + e.message);
        // 画像失敗時もテキストだけ保存したいなら継続
    }

    const now = firebase.database.ServerValue.TIMESTAMP;
    const payload = {
        id: postId,
        uid: user.uid,
        name: user.displayName || "",
        photoURL: user.photoURL || "",
        text_data,
        createdAt: now,
        updatedAt: now,
        ...(imageURL ? { image_data: imageURL } : {})
    };

    await postRef.set(payload);
    console.log("post saved:", postId);
}

// 公開API
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;
window.upload = upload;
