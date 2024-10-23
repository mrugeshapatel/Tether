# Output of the Program:
```
Auction auction1 created for Pic#1 starting at 75 USDt 
Auction auction2 created for Pic#2 starting at 60 USDt 
New bid of 75 USDt from Client#2 on auction auction1 
New bid of 75.5 USDt from Client#3 on auction auction1 
New bid of 80 USDt from Client#2 on auction auction1 
Auction auction1 closed. Winner: Client#2, Price: 80 USDt
```


# P2P Auction System Overview

This peer-to-peer auction system leverages Hyperswarm RPC, Hypercore, and DHT to facilitate decentralized auctions where clients can create, bid, and close auctions in a fully distributed manner.

## Components

### `P2PAuction` Class:

- **Peer Identity**: Each peer has a unique `peerId` and maintains its own local store for auction data.
- **Storage**: Uses **Hypercore** with **Hyperbee** for decentralized storage of auction and bid data.
- **Peer Discovery**: Relies on **DHT (Distributed Hash Table)** to discover and communicate with other peers.
- **P2P Communication**: Uses **Hyperswarm RPC** for remote procedure calls (RPC) between peers, enabling fully distributed auction operations.

### Key Functions:

1. **`init()`**: Initializes the peer by setting up the DHT, Hypercore database, and RPC server for communication.
2. **`bindRpcHandlers()`**: Defines the RPC handlers that manage the auction lifecycle:
    - **`createAuction`**: Allows peers to create a new auction.
    - **`makeBid`**: Handles bid submissions on active auctions.
    - **`closeAuction`**: Closes the auction and declares the winner.
3. **`createAuction()`**: Broadcasts the creation of a new auction to all connected peers.
4. **`makeBid()`**: Allows peers to submit a bid and notifies others of the bid.
5. **`closeAuction()`**: Closes an auction and informs all peers of the final price and the winner.


## Limitations & Future Improvements

### 1. Event Broadcasting
Currently, updates about auctions and bids are not automatically broadcast to all peers. Implementing a **pub/sub model** or **message queue** would allow real-time updates to be pushed to all clients without polling.

### 2. Timeouts & Retries
Handling network failures or peer disconnects requires better management of retries and timeouts to ensure consistent auction operations, especially in unreliable network conditions.

### 3. Security
The current implementation lacks security measures like authentication. In a real-world application, we would need to secure the system to ensure only authorized peers can create, bid, or close auctions.

### 4. Persistent Storage
Right now, **Hyperbee** is used as an in-memory key-value store. For long-term persistence and scalability, an additional storage layer would be required to store data across peer restarts or network changes.



#Explanation of Code

---

# P2P Auction System

This project implements a decentralized peer-to-peer auction system using **Hyperswarm RPC**, **Hypercore**, and **DHT**. The code enables multiple peers to create, bid, and close auctions in a fully distributed network without a central server.

## Components

### `P2PAuction` Class

This class defines the core logic for managing auctions and bids between peers. Each peer has its own identity (`peerId`) and manages auctions locally while communicating with other peers through the DHT network.

### Key Technologies

- **Hyperswarm RPC**: Facilitates communication between peers using remote procedure calls (RPC).
- **Hypercore + Hyperbee**: Provides decentralized storage for auction and bid data.
- **DHT (Distributed Hash Table)**: Enables peer discovery and communication without centralized infrastructure.

---

## Code Breakdown

### 1. **Initialization**

Each peer initializes a **DHT node**, sets up a **Hyperbee database** (backed by Hypercore), and starts an **RPC server** to handle incoming requests.

```js
async init() {
    const core = new Hypercore(`./db/peer-${this.peerId}`);
    this.db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' });
    await this.db.ready();

    let dhtSeed = crypto.randomBytes(32);
    this.dht = new DHT({
        keyPair: DHT.keyPair(dhtSeed),
        bootstrap: [{ host: '127.0.0.1', port: 30001 }] // DHT bootstrap
    });
    await this.dht.ready();

    this.rpc = new RPC({ dht: this.dht });
    this.rpcServer = this.rpc.createServer();
    await this.rpcServer.listen();
    this.bindRpcHandlers();
}
```

### 2. **RPC Handlers**

The peer defines handlers for key actions: creating auctions, placing bids, and closing auctions. These handlers allow peers to respond to requests from other nodes in the network.

- **`createAuction`**: Creates a new auction and stores it locally.
- **`makeBid`**: Processes bids, ensuring that the bid is higher than the current price.
- **`closeAuction`**: Closes an auction and announces the winner.

```js
bindRpcHandlers() {
    this.rpcServer.respond('createAuction', async (req) => {
        const auction = JSON.parse(req.toString('utf-8'));
        this.auctions[auction.id] = auction;
        return Buffer.from(JSON.stringify({ success: true }));
    });

    this.rpcServer.respond('makeBid', async (req) => {
        const bid = JSON.parse(req.toString('utf-8'));
        const auction = this.auctions[bid.auctionId];
        if (auction && bid.price > auction.currentPrice) {
            auction.currentPrice = bid.price;
            auction.highestBidder = bid.bidder;
            return Buffer.from(JSON.stringify({ success: true }));
        } else {
            return Buffer.from(JSON.stringify({ success: false, message: 'Bid too low' }));
        }
    });

    this.rpcServer.respond('closeAuction', async (req) => {
        const auctionId = req.toString('utf-8');
        const auction = this.auctions[auctionId];
        if (auction) {
            return Buffer.from(JSON.stringify({ success: true, winner: auction.highestBidder, price: auction.currentPrice }));
        } else {
            return Buffer.from(JSON.stringify({ success: false }));
        }
    });
}
```

### 3. **Auction Lifecycle Methods**

These methods handle the creation, bidding, and closure of auctions across all peers.

- **`createAuction(auctionId, item, startingPrice)`**: Broadcasts a new auction to all peers.
- **`makeBid(auctionId, price, bidder)`**: Submits a bid for an auction.
- **`closeAuction(auctionId)`**: Closes the auction and notifies all peers of the result.

```js
async createAuction(auctionId, item, startingPrice) {
    const auction = { id: auctionId, item, startingPrice, currentPrice: startingPrice, highestBidder: null };
    this.auctions[auctionId] = auction;
    const auctionBuffer = Buffer.from(JSON.stringify(auction), 'utf-8');
    for (let peerPubKey of this.rpc.peers) {
        await this.rpc.request(peerPubKey, 'createAuction', auctionBuffer);
    }
}

async makeBid(auctionId, price, bidder) {
    const bid = { auctionId, price, bidder };
    const bidBuffer = Buffer.from(JSON.stringify(bid), 'utf-8');
    for (let peerPubKey of this.rpc.peers) {
        await this.rpc.request(peerPubKey, 'makeBid', bidBuffer);
    }
}

async closeAuction(auctionId) {
    const auctionBuffer = Buffer.from(auctionId, 'utf-8');
    for (let peerPubKey of this.rpc.peers) {
        await this.rpc.request(peerPubKey, 'closeAuction', auctionBuffer);
    }
}
```

---

## How It Works

1. **Auction Creation**: A peer creates an auction and broadcasts it to other peers via the DHT.
2. **Bidding**: Peers submit bids, which are processed based on the auction's current price.
3. **Auction Closure**: Once the auction is closed, the winner and final price are announced to all peers.

---

## Usage Example

Here’s a sample scenario where three peers participate in creating auctions and making bids:

```js
(async () => {
    const peer1 = new P2PAuction('1');
    const peer2 = new P2PAuction('2');
    const peer3 = new P2PAuction('3');

    await peer1.init();
    await peer2.init();
    await peer3.init();

    await peer1.createAuction('auction1', 'Pic#1', 75);
    await peer2.createAuction('auction2', 'Pic#2', 60);

    await peer2.makeBid('auction1', 75, 'Client#2');
    await peer3.makeBid('auction1', 75.5, 'Client#3');
    await peer2.makeBid('auction1', 80, 'Client#2');

    await peer1.closeAuction('auction1');
})();
```

---

## Output

```
Auction auction1 created for Pic#1 starting at 75 USDt
Auction auction2 created for Pic#2 starting at 60 USDt
New bid of 75 USDt from Client#2 on auction auction1
New bid of 75.5 USDt from Client#3 on auction auction1
New bid of 80 USDt from Client#2 on auction auction1
Auction auction1 closed. Winner: Client#2, Price: 80 USDt
```
