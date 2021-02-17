const path = require('path');
const crypto = require('crypto');
const EventEmitter = require("events");
const FlowRouter = require('@aspectron/flow-router');
const utils = require('@aspectron/flow-utils');
const async = require('@aspectron/flow-async');
//require("colors");
const fs = require("fs");
const args = utils.args();
const sockjs = require('sockjs');
const session = require('express-session');
const express = require('express');
const bodyParser = require('body-parser');
const Cookie = require("cookie");
const CookieSignature = require("cookie-signature");
const { Command, CommanderError } = require('commander');
const ws = require('ws');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const fetch = require('node-fetch');
const querystring = require('querystring');
const Decimal = require('decimal.js');

const {FlowHttp} = require('@aspectron/flow-http')({
	express,
	session,
	//sockjs,
	ws,
	Cookie,
	CookieSignature,
	grpc, protoLoader
});
const { Wallet, initKaspaFramework, log } = require('@kaspa/wallet-worker');
const { RPC } = require('@kaspa/grpc-node');
const { dpc } = require('@kaspa/wallet/dist/utils/helper');

class KaspaPWA extends EventEmitter {
	constructor(appFolder){
		super();
		this.appFolder = appFolder;
		this.config = utils.getConfig(path.join(appFolder, "config", "kaspa-wallet-pwa"));
		this.ip_limit_map = new Map();
		this.cache = { };

		this.options = {
			port : 3080
		}

		if(!this.config?.http?.session) {

			console.log('');
			console.log('_  _ _ ____ ____ _ _  _ ____    ____ ____ ____ ____ _ ____ _  _    ');
			console.log('|\\/| | [__  [__  | |\\ | | __    [__  |___ [__  [__  | |  | |\\ |  ');
			console.log('|  | | ___] ___] | | \\| |__]    ___] |___ ___] ___] | |__| | \\|    ');

			this.http_session_ = {
				secret:"34343546756767567657534578678672346573237436523798",
				key:"kaspa-faucet-pwa"
			};
		}else{
			this.http_session_ = this.config.http.session;
		}

		console.log('');
		console.log('_  _ ____ ____ ___  ____    _ _ _ ____ _    _    ____ ___    ____ ____ ____ _  _ ____ ____ ');
		console.log('|_/  |__| [__  |__] |__|    | | | |__| |    |    |___  |     [__  |___ |__/ |  | |___ |__/ ');
		console.log('| \\_ |  | ___] |    |  |    |_|_| |  | |___ |___ |___  |     ___] |___ |  \\  \\/  |___ |  \\ ');
		console.log('');

		Wallet.setWorkerLogLevel("none");
	}

	async initHttp(){

		const { host, port } = this.options;

		const flowHttp = this.flowHttp = new FlowHttp(__dirname, {
			config:{
				websocketMode:"RPC",
				websocketPath:"/rpc",
				certificates:{
					key: './certificates/pwa.key',
					crt: './certificates/pwa.crt'
				},
				http:Object.assign({
					host,
					port,
					session: this.http_session_,
					ssl : false
				}, this.config?.http||{}),
				staticFiles:{
					'/':'http',
					'/dist':'dist'
				},
				grpc:{
					protoPath:path.join(this.appFolder, "node_modules/@kaspa/grpc/proto/messages.proto"),
					server:this.grpc.host,
					packageKey:"protowire"
				}
			}
		});
		// this.flowHttp = flowHttp;

		flowHttp.on("app.init", args=>{
			let {app} = args;
			app.use(bodyParser.json())
			app.use(bodyParser.urlencoded({ extended: true }))
			

			let rootFolder = this.appFolder;
			let config = this.config||{};
			const {folders={}} = config;
			const {
				kaspaUX='/node_modules/@kaspa/ux',
				flowUX='/node_modules/@aspectron/flow-ux',
				walletWorker='/node_modules/@kaspa/wallet-worker',
				secp256k1='/node_modules/secp256k1-wasm/http',
				grpcWeb='/node_modules/@kaspa/grpc-web',
				flowGRPCWeb='/node_modules/@aspectron/flow-grpc-web'
			} = folders;

			app.use([
				"/send/:a?", "/qrscanner/:a?", "/open/:a?",
				"/faucet/:a?", "/seeds/:a?", "/receive/:a?", "/t9/:a?"], (req, res)=>{
				res.redirect("/")
			})

			console.log("walletWorker", walletWorker)
			//kaspa-wallet-worker/worker.js
			app.use('/resources', express.static( path.join(kaspaUX, "resources"), {
				index: 'false'
			}))
			app.get('/kaspa-wallet-worker/worker.js', (req, res)=>{
				res.sendFile(path.join(rootFolder, 'dist/kaspa-wallet-worker-core.js'))
			})
			app.get('/node_modules/@aspectron/flow-grpc-web/flow-grpc-web.js', (req, res)=>{
				res.redirect('/node_modules/@aspectron/flow-grpc-web/lib/flow-grpc-web.js')
			})
			app.get('(/kaspa-wallet-worker)?/secp256k1.wasm', (req, res)=>{
				res.setHeader("Content-Type", "application/wasm")
				let file = path.join(rootFolder, secp256k1, 'secp256k1.wasm');
				let stream = fs.createReadStream(file);
				// This will wait until we know the readable stream is actually valid before piping
				stream.on('open', function () {
					// This just pipes the read stream to the response object (which goes to the client)
					stream.pipe(res);
				});
				//stream.pipe(res)
				//res.sendFile(file)
			})

			let router = new FlowRouter(app, {
				mount:{
					// flowUX:'/node_modules/@aspectron/flow-ux',
					flowUX:"/flow/flow-ux",
					litHtml:'/lit-html',
					litElement:'/lit-element',
					webcomponents:'/webcomponentsjs',
					sockjs:'/sockjs'
				},
				rootFolder,
				folders:[
					{url:'/http', folder:path.join(rootFolder, "http")},
					{url:'/kaspa-ux', folder:kaspaUX},
					{url:'/node_modules/@aspectron/flow-ux', folder:flowUX},
					{url:'/kaspa-wallet-worker', folder:walletWorker},
					{url:'/resources/extern', folder:flowUX+'/resources/extern'},
					{url:'/@kaspa/grpc-web', folder:grpcWeb},
					{url:'/node_modules/@aspectron/flow-grpc-web', folder:flowGRPCWeb},
					{url:'/flow-qrscanner', folder:'../flow-qrscanner'}
				]
			});
			router.init();
		});

		flowHttp.init();
	}

	async initKaspa() {

		await initKaspaFramework();

		const aliases = Object.keys(Wallet.networkAliases);
		let filter = aliases.map((alias) => { return this.options[alias] ? Wallet.networkAliases[alias] : null; }).filter(v=>v);
		if(this.options.grpc && filter.length != 1) {
			log.error('You must explicitly use the network flag when specifying the gRPC option');
			log.error('Option required: --mainnet, --testnet, --devnet, --simnet')
			process.exit(1);
		}

		let network = filter.shift() || 'kaspa';
		let port = Wallet.networkTypes[network].port;
		let host = this.options.grpc || `127.0.0.1:${port}`;


//		this.rpc = { }
		log.info(`Creating gRPC binding for network '${network}' at ${host}`);
		const kaspad = new RPC({ clientConfig:{ host } });
		kaspad.onError((error)=>{ log.error(`gRPC[${host}] ${error}`); })

		this.grpc = { network, port, host, kaspad }
	}

	async initMonitors() {
		const medianOffset = 45*1000; // allow 45 sec behind median
		const medianShift = Math.ceil(263*0.5*1000);

		const poll = async () => {
			const ts_ = new Date();
			const ts = ts_.getTime() - medianShift;
			const data = { }

			try {
				const bdi = await  this.grpc.kaspad.request('getBlockDagInfoRequest');
				const vspbs = await  this.grpc.kaspad.request('getVirtualSelectedParentBlueScoreRequest');

				const blueScore = parseInt(vspbs.blueScore);
				const blockCount = parseInt(bdi.blockCount);
				const headerCount = parseInt(bdi.headerCount);
				const difficulty = parseInt(bdi.difficulty);
				const networkName = bdi.networkName;
				const pastMedianTime = parseInt(bdi.pastMedianTime);
				const pastMedianTimeDiff = Math.max(ts - pastMedianTime, 0);

				this.flowHttp.sockets.publish('network-status', {
					blueScore, blockCount, headerCount, difficulty, networkName, pastMedianTime, pastMedianTimeDiff
				});
			} catch(ex) {
				console.log(ex.toString());
			}

			dpc(3500, ()=>{ poll(); });
		}

		this.monitors = { };
		dpc(()=>{ poll(); });
	}

	async initRPC() {
		const { flowHttp } = this;
		const faucetUrl = 'https://faucet.kaspanet.io';
		let availableRequests = flowHttp.sockets.subscribe("faucet-request");
		(async ()=>{
			for await(const msg of availableRequests) {
				const { data, ip } = msg;
				const { address, amount } = data;
				const sompis = Decimal(amount).mul(1e8).toNumber();
				fetch(`${faucetUrl}/api/${this.config.faucet_apikey}/get/${address}?ip=${querystring.escape(ip)}&amount=${querystring.escape(sompis)}`, { method: 'GET' })
				.then(res => res.json()) 
				.then(json => msg.respond({ip, ...json}))
				.catch(ex=>{
					msg.respond({error:'Unable to request funds from faucet'});
					console.log(ex.toString());
				});
			}
		})();
		let getRequests = flowHttp.sockets.subscribe("faucet-available");
		(async ()=>{
			for await(const msg of getRequests) {
				const { data, ip } = msg;
				const { address } = data;
				fetch(`${faucetUrl}/api/${this.config.faucet_apikey}/available/${address}?ip=${querystring.escape(ip)}`, { method: 'GET' })
				.then(res => res.json()) 
				.then(json => msg.respond({ip, ...json}))
				.catch(ex=>{
					msg.respond({error:'Unable to obtain faucet balance'});
					console.log(ex.toString());
				});
			}
		})();
	}

	async initWallet() {
		// const { flowHttp } = this;
		// let socketConnections = flowHttp.sockets.events.subscribe('connect');
		// (async()=>{
		// 	for await(const event of socketConnections) {
		// 		const { networks, addresses, limits } = this;
		// 		const { socket, ip } = event;
		// 		socket.publish('networks', { networks });
		// 		socket.publish('addresses', { addresses });
		// 		networks.forEach(network=>{
		// 			let wallet = this.wallets[network];

		// 			if(!wallet)
		// 				return;
		// 			const { balance } = wallet;
		// 			//setTimeout(()=>{
		// 				socket.publish(`balance`, { network, balance });
		// 				//console.log("wallet balance",  balance)
		// 			//}, 50);
		// 			this.publishLimit({ network, socket, ip });

		// 			let cache = this.cache[network];
		// 			if(cache && cache.length) {
		// 				cache.forEach((msg) => {
		// 					socket.publish(`utxo-change`, msg);
		// 				})
		// 			}

		// 		});
		// 	}
		// })();

	}

	async main() {
		const logLevels = ['error','warn','info','verbose','debug'];
		const program = this.program = new Command();
		program
			.version('0.0.1', '--version')
			.description('Kaspa Wallet')
			.helpOption('--help','display help for command')
			.option('--log <level>',`set log level ${logLevels.join(', ')}`, (level)=>{
				if(!logLevels.includes(level))
					throw new Error(`Log level must be one of: ${logLevels.join(', ')}`);
				return level;
			})
			.option('--verbose','log wallet activity')
			.option('--debug','debug wallet activity')
			.option('--testnet','use testnet network')
			.option('--devnet','use devnet network')
			.option('--simnet','use simnet network')
			//.option('--no-ssl','disable SSL')
			.option('--host <host>','http host (default: localhost)', 'localhost')
			.option('--port <port>',`set http port (default ${this.options.port})`, (port)=>{
				port = parseInt(port);
				if(isNaN(port))
					throw new Error('Port is not a number');
				if(port < 0 || port > 0xffff)
					throw new Error('Port number is out of range');
				return port;
			})
            .option('--grpc <address>','use custom gRPC address <host:port>')
			;

		program.command('run', { isDefault : true })
			.description('run wallet daemon')
			.action(async ()=>{

				let options = program.opts();
				Object.entries(options).forEach(([k,v])=>{ if(v === undefined) delete options[k]; })
				Object.assign(this.options, options);
				//  console.log(this.options);
				//  return;

				log.level = (this.options.verbose&&'verbose')||(this.options.debug&&'debug')||(this.options.log)||'info';

				await this.initKaspa();
				await this.initHttp();
				await this.initRPC();
				await this.initMonitors();
				//await this.initWallet();
			})

		program.parse();
	}

	KAS(v) {
		var [int,frac] = Decimal(v).mul(1e-8).toFixed(8).split('.');
		int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		frac = frac?.replace(/0+$/,'');
		return frac ? `${int}.${frac}` : int;
	}

}

(async () => {
	let kaspaPWA = new KaspaPWA(__dirname);
	try {
		await kaspaPWA.main();
	} catch(ex) {
		console.log(ex.toString());
	}
})();
