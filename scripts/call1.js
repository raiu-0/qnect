const vid1 = document.getElementById('user-1');
const vid2 = document.getElementById('user-2');

const APP_ID = '6937689c3f84481f868c0e5f78bd0301';

let token = null;
const uid = String(Math.floor(Math.random() * 1000));


const ICEservers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ]
};

let client;
let channel;

let local_stream = null;
let remote_stream = null;
let peer_connection = new RTCPeerConnection(ICEservers);

const constraints = {
    video: true,
    audio: true
};

let candidateQueue = [];
let remoteDescriptionSet = false;

async function init() {
    client = AgoraRTM.createInstance(APP_ID); // Ensure AgoraRTM is available
    await client.login({ uid, token });

    channel = client.createChannel('QNect');
    await channel.join();

    channel.on('MemberJoined', handle_user_joined);
    channel.on('MemberLeft', handle_user_left);
    client.on('MessageFromPeer', handle_message_from_peer);

    local_stream = await navigator.mediaDevices.getUserMedia(constraints);
    vid1.srcObject = local_stream;

    remote_stream = new MediaStream();
    vid2.srcObject = remote_stream;

    local_stream.getTracks().forEach((track) => {
        peer_connection.addTrack(track, local_stream);
    });

    peer_connection.ontrack = async (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remote_stream.addTrack(track);
        });
    };
}

async function handle_user_joined(MemberId) {
    if (!local_stream) {
        local_stream = await navigator.mediaDevices.getUserMedia(constraints);
        vid1.srcObject = local_stream;
    }

    peer_connection.onicecandidate = async (event) => {
        if (event.candidate) {
            client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'candidate', 'candidate': event.candidate }) }, MemberId);
        }
    };

    const offerDesc = await peer_connection.createOffer();
    await peer_connection.setLocalDescription(offerDesc);
    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'offer', 'offer': offerDesc }) }, MemberId);
}

async function handle_message_from_peer(message, MemberId) {
    message = JSON.parse(message.text);

    if (message.type === 'offer') {
        console.log('OFFER RECEIVED', message.offer);
        await peer_connection.setRemoteDescription(new RTCSessionDescription(message.offer));
        remoteDescriptionSet = true;

        if (!local_stream) {
            local_stream = await navigator.mediaDevices.getUserMedia(constraints);
            vid1.srcObject = local_stream;
            local_stream.getTracks().forEach(track => peer_connection.addTrack(track, local_stream));
        }

        const answerDesc = await peer_connection.createAnswer();
        await peer_connection.setLocalDescription(answerDesc);
        client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'answer', 'answer': answerDesc }) }, MemberId);

        // Process any queued ICE candidates
        candidateQueue.forEach(candidate => peer_connection.addIceCandidate(candidate));
        candidateQueue = [];

    } else if (message.type === 'answer') {
        console.log('ANSWER RECEIVED');
        await peer_connection.setRemoteDescription(new RTCSessionDescription(message.answer));
        remoteDescriptionSet = true;

        // Process any queued ICE candidates
        candidateQueue.forEach(candidate => peer_connection.addIceCandidate(candidate));
        candidateQueue = [];

    } else if (message.type === 'candidate' && message.candidate) {
        console.log('CANDIDATE RECEIVED', message.candidate);
        const candidate = new RTCIceCandidate(message.candidate);

        if (remoteDescriptionSet) {
            try {
                await peer_connection.addIceCandidate(candidate);
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        } else {
            candidateQueue.push(candidate);
        }
    }
}

async function handle_user_left(MemberId) {
    document.getElementById('user-2').srcObject = null;
}

async function leave_channel() {
    await channel.leave();
    await channel.logout();
}

init();
window.addEventListener('beforeunload', leave_channel);