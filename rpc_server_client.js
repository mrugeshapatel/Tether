const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const crypto = require('crypto');

class P2PAuction {
    constructor(peerId) {
        this.peerId = peerId;
        this.db = null;
        this.dht = null;
        this.rpc = null;
        this.rpcServer = null;
        this.auctions = {};  // Local auction store
    }

    // Initialize the DHT, Hypercore, and RPC setup
    async init() {
        // Hyperbee-backed storage for auction data
        const core = new Hypercore(`./db/peer-${this.peerId}`);
        this.db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' });
        await this.db.ready();

        // DHT network setup
        let dhtSeed = crypto.randomBytes(32);
        this.dht = new DHT({
            keyPair: DHT.keyPair(dhtSeed),
            bootstrap: [{ host: '127.0.0.1', port: 30001 }] // Replace with actual bootstrap node if required
        });
        await this.dht.ready();

        // Setup RPC
        this.rpc = new RPC({ dht: this.dht });
        this.rpcServer = this.rpc.createServer();
        await this.rpcServer.listen();
        this.bindRpcHandlers();
    }

    // Bind the RPC handlers to allow interaction between peers
    bindRpcHandlers() {
        // Create auction handler
        this.rpcServer.respond('createAuction', async (req) => {
            const auction = JSON.parse(req.toString('utf-8'));
            this.auctions[auction.id] = auction;
            console.log(`Auction ${auction.id} created for ${auction.item} starting at ${auction.startingPrice} USDt`);
            return Buffer.from(JSON.stringify({ success: true }));
        });

        // Make bid handler
        this.rpcServer.respond('makeBid', async (req) => {
            const bid = JSON.parse(req.toString('utf-8'));
            const auction = this.auctions[bid.auctionId];

            if (auction && bid.price > auction.currentPrice) {
                auction.currentPrice = bid.price;
                auction.highestBidder = bid.bidder;
                console.log(`New bid of ${bid.price} USDt from ${bid.bidder} on auction ${bid.auctionId}`);
                return Buffer.from(JSON.stringify({ success: true }));
            } else {
                return Buffer.from(JSON.stringify({ success: false, message: 'Bid too low' }));
            }
        });

        // Close auction handler
        this.rpcServer.respond('closeAuction', async (req) => {
            const auctionId = req.toString('utf-8');
            const auction = this.auctions[auctionId];

            if (auction) {
                console.log(`Auction ${auctionId} closed. Winner: ${auction.highestBidder}, Price: ${auction.currentPrice} USDt`);
                return Buffer.from(JSON.stringify({ success: true, winner: auction.highestBidder, price: auction.currentPrice }));
            } else {
                return Buffer.from(JSON.stringify({ success: false, message: 'Auction not found' }));
            }
        });
    }

    // Announce auction creation to other peers
    async createAuction(auctionId, item, startingPrice) {
        const auction = {
            id: auctionId,
            item,
            startingPrice,
            currentPrice: startingPrice,
            highestBidder: null,
        };
        this.auctions[auctionId] = auction;

        const auctionBuffer = Buffer.from(JSON.stringify(auction), 'utf-8');
        for (let peerPubKey of this.rpc.peers) {
            await this.rpc.request(peerPubKey, 'createAuction', auctionBuffer);
        }
        console.log(`Auction ${auctionId} for ${item} created`);
    }

    // Make a bid on an auction
    async makeBid(auctionId, price, bidder) {
        const bid = {
            auctionId,
            price,
            bidder
        };
        const bidBuffer = Buffer.from(JSON.stringify(bid), 'utf-8');

        for (let peerPubKey of this.rpc.peers) {
            await this.rpc.request(peerPubKey, 'makeBid', bidBuffer);
        }
        console.log(`${bidder} placed a bid of ${price} USDt on auction ${auctionId}`);
    }

    // Close auction and notify peers
    async closeAuction(auctionId) {
        const auctionBuffer = Buffer.from(auctionId, 'utf-8');

        for (let peerPubKey of this.rpc.peers) {
            await this.rpc.request(peerPubKey, 'closeAuction', auctionBuffer);
        }
        console.log(`Auction ${auctionId} closed`);
    }
}

