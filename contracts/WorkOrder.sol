pragma solidity ^0.8.0;

// One plain BCH UTXO per deliverable. Parties and policy are baked into its address.
contract WorkOrder(pubkey client, pubkey maker, pubkey mediator, int refundHeight, int feeCap) {
    int constant DUST = 546;
    int constant MAX_FEE = 10000;

    modifier plainBchOrder() {
        require(tx.inputs[this.activeInputIndex].tokenCategory == 0x);
        require(feeCap > 0 && feeCap <= MAX_FEE);
        require(refundHeight > 0 && refundHeight < 500000000);
        _;
    }

    modifier jointConsent(sig clientSig, sig makerSig) {
        require(checkSig(clientSig, client));
        require(checkSig(makerSig, maker));
        _;
    }

    // Shared covenant helper pins the recipient and a standard P2PKH minimum.
    function partyOutput(pubkey party, int index) internal {
        require(tx.outputs[index].lockingBytecode == new LockingBytecodeP2PKH(hash160(party)));
        require(tx.outputs[index].value >= DUST);
    }

    function payInFull(pubkey party) internal {
        partyOutput(party, 0);
        require(tx.outputs[0].value >= tx.inputs[this.activeInputIndex].value - feeCap);
    }

    function approve(sig clientSig, sig makerSig) public plainBchOrder jointConsent(clientSig, makerSig) {
        payInFull(maker);
    }

    // Both parties can unwind an abandoned order immediately, without waiting for the timeout.
    function cancel(sig clientSig, sig makerSig) public plainBchOrder jointConsent(clientSig, makerSig) {
        payInFull(client);
    }

    // After this height the client may recover unfinished work. Other valid settlements can still race it.
    function refund(sig clientSig) public plainBchOrder {
        require(checkSig(clientSig, client));
        require(tx.time >= refundHeight);
        payInFull(client);
    }

    // The mediator chooses a split but cannot redirect either party's award.
    function resolve(sig mediatorSig, int makerSats) public plainBchOrder {
        require(checkSig(mediatorSig, mediator));
        require(makerSats >= DUST);
        partyOutput(maker, 0);
        require(tx.outputs[0].value == makerSats);
        partyOutput(client, 1);
        require(tx.outputs[0].value + tx.outputs[1].value >= tx.inputs[this.activeInputIndex].value - feeCap);
    }
}
