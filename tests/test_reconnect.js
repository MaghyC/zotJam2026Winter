const io = require('socket.io-client');

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';

function connect(name, previousPlayerId = null) {
    return new Promise((resolve, reject) => {
        const socket = io(SERVER, { transports: ['websocket'] });
        socket.on('connect', () => {
            socket.emit('join_lobby', { username: name, previousPlayerId });
        });
        socket.on('join_lobby_response', (data) => resolve({ socket, data }));
        socket.on('reconnected', (d) => console.log('reconnected event', d));
        socket.on('connect_error', (err) => reject(err));
        socket.on('error', (err) => console.error('socket error', err));
    });
}

(async () => {
    console.log('Starting reconnect test against', SERVER);
    const a = await connect('Alice');
    const aid = a.data.playerId;
    const lobby = a.data.lobbyCode;
    console.log('Alice connected as', aid, 'in lobby', lobby);

    // Close socket (simulate refresh)
    a.socket.close();
    console.log('Closed original socket, reconnecting with previousPlayerId');

    // Small delay
    await new Promise(r => setTimeout(r, 200));

    const b = await connect('Alice', aid);
    const newId = b.data.playerId;
    console.log('Reconnected, server returned playerId=', newId);

    if (newId === aid) {
        console.log('Reconnect reuse OK');
        b.socket.close();
        process.exit(0);
    } else {
        console.error('Reconnect failed: expected', aid, 'got', newId);
        b.socket.close();
        process.exit(1);
    }

})();
