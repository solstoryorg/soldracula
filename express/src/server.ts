import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';

import express, { NextFunction, Request, Response, Router } from 'express';
import StatusCodes from 'http-status-codes';
import 'express-async-errors';
import NodeCache from 'node-cache';

import logger from 'jet-logger';
import fs from 'fs';

import { Connection, Transaction, ParsedInstruction, ParsedAccountData, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet, Provider, } from '@project-serum/anchor';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { SolstoryAPI, utils, SolstoryItemInner, SolstoryItemType } from '@solstory/api';
import { TextEncoder } from 'util';

// Constants
const app = express();
const ANCHOR_WALLET = process.env.ANCHOR_WALLET as string
// let ENDPOINT = 'https://api.devnet.solana.com';
let ENDPOINT = 'http://localhost:8899';
let BUNDLR_ENDPOINT = 'devnet';



//these need to be sequentiallly appended to our story
const DRACULA = [
        {
            type: SolstoryItemType.Item,
            display:{
                label: "Richter:",
                description: "Die monster. You don’t belong in this world!",
                helpText: "Castlevania: Symphony of the Night",
                img: "http://soldracula.is/static/richter.jpg"
            },
            data: {
            }
        },
        {
            type: SolstoryItemType.Item,
            display:{
                label: "Dracula:",
                description: "It was not by my hand I was once again given flesh. I was brought here by humans who wished to pay me tribute!",
                helpText: "Castlevania: Symphony of the Night",
                img: "http://soldracula.is/static/dracula.jpg"
            },
            data: {
            }
        },
        {
            type: SolstoryItemType.Item,
            display:{
                label: "Richter:",
                description: "Tribute!? You steal men’s souls, and make them your slaves!",
                helpText: "Castlevania: Symphony of the Night",
                img: "http://soldracula.is/static/richter.jpg"
            },
            data: {
            }
        },
        {
            type: SolstoryItemType.Item,
            display:{
                label: "Dracula:",
                description: "Perhaps the same could be said of all religions… ",
                helpText: "Castlevania: Symphony of the Night",
                img: "http://soldracula.is/static/dracula.jpg"
            },
            data: {
            }
        },
        {
            type: SolstoryItemType.Item,
            display:{
                label: "Richter:",
                description: "Your words are as empty as your soul! Mankind ill needs a savior such as you!",
                helpText: "Castlevania: Symphony of the Night",
                img: "http://soldracula.is/static/richter.jpg"
            },
            data: {
            }
        },
        {
            type: SolstoryItemType.Item,
            display:{
                label: "Dracula:",
                description: "What is a man? A miserable little pile of secrets. But enough talk… Have at you!",
                helpText: "Castlevania: Symphony of the Night",
                img: "http://soldracula.is/static/dracula.jpg"
            },
            data: {
            }
        },
]

/***********************************************************************************
 *                                  Middlewares
 **********************************************************************************/

// Common middlewares
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());

// Show routes called in console during development
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
    ENDPOINT = 'http://localhost:8899'
    // ENDPOINT = 'https://api.devnet.solana.com';
    BUNDLR_ENDPOINT = 'devnet';
    console.log("using dev");

}
//
// Security (helmet recommended in express docs)
if (process.env.NODE_ENV === 'production') {
    app.use(helmet());
    ENDPOINT = 'https://api.devnet.solana.com'
    BUNDLR_ENDPOINT = 'devnet';
}

const connection = new Connection(ENDPOINT);


/***********************************************************************************
 *                                  Infrastructure
 **********************************************************************************/


console.log("Using wallet at: ", ANCHOR_WALLET);

//we initialize this the same we would an anchor api
const raw = fs.readFileSync(path.resolve(ANCHOR_WALLET), 'utf8');
const wallet = new Wallet(Keypair.fromSecretKey(Buffer.from(JSON.parse(raw))));
const provider = new Provider(connection, wallet, { commitment: 'confirmed' });
const solstoryApi = new SolstoryAPI({}, provider);
solstoryApi.configureBundlrServer(Buffer.from(JSON.parse(raw)), BUNDLR_ENDPOINT, 20);


/***********************************************************************************
 *                         API routes and error handling
 **********************************************************************************/

const router = Router()
const { CREATED, OK } = StatusCodes;
const transCache = new NodeCache({stdTTL: 60*60})

/*
 * This function is just an easy way for us to handle one time setup for solstory. It would
 * be totally reasonable to do this as a yarn script. Actually it would make a lot
 * more sense as a yarn script. But I was feeling lazy the morning I wrote this.
 */
router.get('/init',  async (req: Request, res: Response, next:NextFunction):Promise<string> => {
    const [solstoryPda, _nonce2] = await PublicKey.findProgramAddress(
      [Buffer.from((new TextEncoder()).encode("solstory_pda"))],
      solstoryApi.programId
    );

    try {
    await solstoryApi.rpc.initialize({
        accounts:{
          solstoryPda: solstoryPda,
          authority: wallet.publicKey,
          systemProgram: "11111111111111111111111111111111"
        },
        signers:[wallet.payer]
    });
    }catch(e){
        console.log("already initted");
    }

    return solstoryApi.server.writer.createWriterMetadata({
        writerKey: wallet.payer.publicKey,
        cdn: "",
        label: "Dracula!",
        description: "Best meme of all time.",
        url: "http://soldracula.is",
        metadata: JSON.stringify({}),
        hasExtendedMetadata:false,
        systemValidated: false,
        logo: "",
        baseUrl:"",
        apiVersion: 1,
        visible: true,
    })

});

router.get('/dracula/:txid', (req: Request, res: Response, next:NextFunction) => {
    const { txid } = req.params;

    // quick bit of ddos prevention - we don't want to infinitely append because
    // non-users could repeatedly send us stale transactions to try and trigger a flood
    const cacheHit = transCache.get(txid);
    if(cacheHit){
        throw Error("Transaction already processed.");
    }

    // we are waiting for the transaction to be confirmed so we can retrieve it.
    connection.confirmTransaction(txid).then((res) => {
        console.log("confirmed transaction: ", res)
        // get the transaction
        return connection.getParsedTransaction((txid ))
    }).then(async (tx) => {
        // check for a failure case
        if(tx==null)
            throw Error("Transaction not found")

        // Verify that the given transaction has the correct shape.
        // Basically we don't want someone using a txid that wasn't made by our frontend.
        const transferIx = tx.transaction.message.instructions[0] as ParsedInstruction;
        if (transferIx.program != 'system' ||
            transferIx.parsed.info.destination != wallet.payer.publicKey.toBase58() ||
                transferIx.parsed.type != 'transfer'){
            console.log(transferIx.parsed.destination, wallet.payer.publicKey);
            throw Error("Invalid transaction")
        }

        // More of the same, verifying transaction shape.
        const memoIx = tx.transaction.message.instructions[1] as ParsedInstruction;
        if(memoIx.program != 'spl-memo' ||
          memoIx.parsed.length > 44 || memoIx.parsed.length < 32)
            throw Error("Invalid transaction");

        // Pull out out the owner (ty Solana Cookbook)
        const nftId:string = memoIx.parsed;
        const bigActs = await connection.getTokenLargestAccounts(new PublicKey(nftId));
        const largestAccountInfo = await connection.getParsedAccountInfo(bigActs.value[0].address);
        if(largestAccountInfo.value == undefined)
            throw Error("Invalid transaction");
        const ownerActual = (largestAccountInfo.value.data as ParsedAccountData).parsed.info.owner;

        const ownerShould = transferIx.parsed.info.source;

        // Verify that the nft owner is the one who made the transaction request
        if(ownerActual != ownerShould)
            throw Error("Invalid transaction");

        // Now we can append everything
        let out;
        for(let i = 0; i <DRACULA.length; i++) {
           const item =  DRACULA[i];
           out = await solstoryApi.server.writer.appendItemCreate(new PublicKey(nftId), item, {confirmation:{commitment:'finalized'}});
        }

        transCache.set(txid, true);
        // We send back the transaction signature of the _last_ append, since if someone wants to wait on confirmation
        // that's the one that'll be last
        res.status(OK).json(out);
    }).catch(next);
});

app.use(cors())
app.use(router);


// Error handling
app.use((err: Error, _: Request, res: Response, __: NextFunction) => {
    logger.err(err, true);
    return res.status(500).json({
        error: err.message,
    });
});

// Export here and start in a diff file (for testing).
export default app;
