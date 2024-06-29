const APP_ID = '6937689c3f84481f868c0e5f78bd0301';

let token = null;
const uid = String(Math.floor(Math.random() * 1000));

let client;
let channel;

let local_stream;
let remote_stream;
let peer_connection;

const ICEservers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ]
};

let constraints = {
    video: true,
    audio: true
};

async function init() {
    client = AgoraRTM.createInstance(APP_ID);
    await client.login({ uid, token });

    channel = client.createChannel('QNect');
    await channel.join();

    channel.on('MemberJoined', handle_user_joined);
    channel.on('MemberLeft', handle_user_left);
    client.on('MessageFromPeer', handle_message_from_peer);

    local_stream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById('user-1').srcObject = local_stream;
}

async function handle_user_joined(MemberId) {
    create_offer(MemberId);
}

async function handle_user_left(MemberId) {
    document.getElementById('user-2').srcObject = null;
}

async function leave_channel() {
    await channel.leave();
    await channel.logout();
}

let ICEcandidates = [];

async function handle_message_from_peer(message, MemberId) {
    message = JSON.parse(message.text);
    if (message.type === 'offer') {
        create_answer(MemberId, message.offer);
    }
    if (message.type === 'answer') {
        add_answer(message.answer);
    }
    if (message.type === 'candidate') {
        if (peer_connection) {
            peer_connection.addIceCandidate(message.candidate);
        }
    }
}

async function create_peer_connection(MemberId) {
    peer_connection = new RTCPeerConnection(ICEservers);
    remote_stream = new MediaStream();
    document.getElementById('user-2').srcObject = remote_stream;

    if (!local_stream) {
        local_stream = await navigator.mediaDevices.getUserMedia(constraints);
        document.getElementById('user-1').srcObject = local_stream;
    }

    local_stream.getTracks().forEach((track) => {
        peer_connection.addTrack(track, local_stream);
    });

    peer_connection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remote_stream.addTrack(track);
        })
    };

    
}

async function create_offer(MemberId) {
    await create_peer_connection(MemberId);
    let offer = await peer_connection.createOffer();
    await peer_connection.setLocalDescription(offer);
    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'offer', 'offer': offer }) }, MemberId);
    peer_connection.onicecandidate = async (event) => {
        if (event.candidate) {
            client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'candidate', 'candidate': event.candidate }) }, MemberId);
        }
    }
}

async function create_answer(MemberId, offer) {
    await create_peer_connection(MemberId);

    await peer_connection.setRemoteDescription(offer);

    let answer = await peer_connection.createAnswer();
    await peer_connection.setLocalDescription(answer);
    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'answer', 'answer': answer }) }, MemberId);
}

async function add_answer(answer) {
    if (!peer_connection.currentRemoteDescription) {
        await peer_connection.setRemoteDescription(answer);
    }
}

init();

window.addEventListener('beforeunload', leave_channel);