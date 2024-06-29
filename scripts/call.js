import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'

import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    addDoc,
    updateDoc,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'

const firebaseConfig = {
    apiKey: "AIzaSyAy1fp2Kl5PbSZgf1ixbbk2BcX-wMyl-XY",
    authDomain: "qnect-1d70b.firebaseapp.com",
    projectId: "qnect-1d70b",
    storageBucket: "qnect-1d70b.appspot.com",
    messagingSenderId: "361576864076",
    appId: "1:361576864076:web:b3a40bb06e8f72c1c997e9",
    measurementId: "G-GZBFKKNGJF"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore();

const ICEservers = {
    iceServers: [
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:3478" },
        { urls: "stun:stun1.l.google.com:5349" },
        {
            urls: "stun:stun.relay.metered.ca:80",
        },
        {
            urls: "turn:global.relay.metered.ca:80",
            username: "5f3420275d579d5b84059fbc",
            credential: "oJxAjKvoo9WNW5RR",
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "5f3420275d579d5b84059fbc",
            credential: "oJxAjKvoo9WNW5RR",
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: "5f3420275d579d5b84059fbc",
            credential: "oJxAjKvoo9WNW5RR",
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "5f3420275d579d5b84059fbc",
            credential: "oJxAjKvoo9WNW5RR",
        },
    ]
};

let peer_connection = new RTCPeerConnection(ICEservers);
let local_stream = null;
let remote_stream = null;

const vid1 = document.getElementById('user-1');
const vid2 = document.getElementById('user-2');


local_stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
remote_stream = new MediaStream();

local_stream.getTracks().forEach(track => {
    peer_connection.addTrack(track, local_stream);
});

peer_connection.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
        remote_stream.addTrack(track);
    })

};

vid1.srcObject = local_stream;
vid2.srcObject = remote_stream;

let is_caller = false;

let j = 0;
onSnapshot(collection(db, 'calls'), (snapshot) => {
    if (j == 1 && !is_caller) {
        let val = snapshot.docChanges()[0].doc.id;
        console.log('answered call');
        console.log(val);
        answer_call(val);
    }
    j++;
});


let i = 0;
const user_log = doc(collection(db, 'call_mem'));
const id = user_log.id;
await setDoc(user_log, { id }).then(() => {
    onSnapshot(collection(db, 'call_mem'), (snapshot) => {
        console.log(i);
        if (i == 1) {
            console.log('started-call');
            is_caller = true;
            start_call();
        }
        i++;
    });
});





const start_call = async () => {
    const call_doc = doc(collection(db, 'calls'));
    const offer_candidates = collection(call_doc, 'offer_candidates');
    const answer_candidates = collection(call_doc, 'answer_candidates');

    peer_connection.onicecandidate = async (event) => {
        event.candidate && addDoc(offer_candidates, event.candidate.toJSON());
    };

    const offer_desc = await peer_connection.createOffer();
    await peer_connection.setLocalDescription(offer_desc);
    console.log(offer_desc);

    const offer = {
        sdp: offer_desc.sdp,
        type: offer_desc.type
    };

    await setDoc(call_doc, offer);

    onSnapshot(call_doc, (snapshot) => {
        const data = snapshot.data();
        if (!peer_connection.currentRemoteDescription && data.type === 'answer') {
            const answer_desc = new RTCSessionDescription(data);
            new Promise((resolve, reject) => {
                peer_connection.setRemoteDescription(answer_desc)
                resolve(1);
            }).then((res) => {
                onSnapshot(answer_candidates, (snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === 'added') {
                            const candidate = new RTCIceCandidate(change.doc.data());
                            peer_connection.addIceCandidate(candidate);
                            console.log('candidate added', candidate);
                        }
                    })
                });
            }).catch((err) => {
                console.log(err);
            });
        }
    });

}

const answer_call = async (callId) => {
    const call_doc = doc(collection(db, 'calls'), callId);
    const offer_candidates = collection(call_doc, 'offer_candidates');
    const answer_candidates = collection(call_doc, 'answer_candidates');

    peer_connection.onicecandidate = async (event) => {
        event.candidate && addDoc(answer_candidates, event.candidate.toJSON());
    };

    const call_data = (await getDoc(call_doc)).data();

    console.log(call_data);

    Promise.all([new Promise(async (resolve, reject) => {
        const offer_desc = call_data;
        await peer_connection.setRemoteDescription(new RTCSessionDescription(offer_desc));
        resolve(1);
    }), new Promise(async (resolve, reject) => {
        const answer_desc = await peer_connection.createAnswer();
        await peer_connection.setLocalDescription(answer_desc);

        const answer = {
            type: answer_desc.type,
            sdp: answer_desc.sdp
        };
        await updateDoc(call_doc, answer);
        resolve(2);
    })]).then((res) => {
        onSnapshot(offer_candidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                console.log(change)
                if (change.type === 'added') {
                    let data = change.doc.data();
                    console.log(data);
                    peer_connection.addIceCandidate(new RTCIceCandidate(data));
                    console.log('candidate added', data);
                }
            })
        });
    });


};