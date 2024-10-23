(async () => {
	// Initialize the peer instances in parallel
	const peer1 = new P2PAuction('1');
	const peer2 = new P2PAuction('2');
	const peer3 = new P2PAuction('3');

	// Initialize peers concurrently using Promise.all
	await Promise.all([peer1.init(), peer2.init(), peer3.init()]);

	// Create auctions in parallel
	await Promise.all([
					peer1.createAuction('auction1', 'Pic#1', 75),  // Client#1 opens auction: sell Pic#1 for 75 USDt
					peer2.createAuction('auction2', 'Pic#2', 60)   // Client#2 opens auction: sell Pic#2 for 60 USDt
	]);

	// Make bids in parallel
	await Promise.all([
					peer2.makeBid('auction1', 75, 'Client#2'),  // Client#2 makes bid for Client#1->Pic#1 with 75 USDt
					peer3.makeBid('auction1', 75.5, 'Client#3') // Client#3 makes bid for Client#1->Pic#1 with 75.5 USDt
	]);

	// Client#2 makes another bid (dependent on previous bids, so done afterward)
	await peer2.makeBid('auction1', 80, 'Client#2');  // Client#2 makes bid for Client#1->Pic#1 with 80 USDt

	// Close auction (after all bids are done)
	await peer1.closeAuction('auction1');  // Client#1 closes auction and notifies others
})();
