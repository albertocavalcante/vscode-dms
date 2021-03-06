/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { authenticate } from "./authenticate";
import { DMSidebarProvider } from "./DMSidebarProvider";
import { Util } from "./util";
import { apiBaseUrl } from './constants';
const io = require("socket.io-client");
import axios from 'axios';
import { accessTokenKey } from './constants';

export async function activate(context: vscode.ExtensionContext) {
	Util.context = context;
	if (!Util.isLoggedIn()) {
		const choice = await vscode.window.showInformationMessage(
			`You need to login to GitHub to start messaging, would you like to continue?`,
			"Yes",
			"Cancel"
		);
		if (choice === "Yes") {
			authenticate();
		}
	}

	console.log('yoz! vscode-dms is active.');

	let res = await axios.get(`${apiBaseUrl}/api/users?access_token=${Util.getAccessToken()}`);
	let loginUser = res.data;

	const socket = io.connect(apiBaseUrl);
	console.log('Socket initialized');

	const sendSocketId = async () => {
		socket.on("connect", async () => {
			await axios.get(`${apiBaseUrl}/api/users/socket?access_token=${Util.getAccessToken()}&socket_id=${socket.id}`
			);
		});
		socket.emit("status", { user: Util.getAccessToken(), status: 'online' });
	};

	await sendSocketId();

	socket.on("receive-message", async (msg: { sender: string; message: string; receiver: string; group: boolean; conversation_id: string }) => {
		if (msg.group && msg.sender != loginUser.username) {
			vscode.window.showInformationMessage(msg.receiver + ': ' + msg.sender + ': ' + msg.message);
			await axios.post(`${apiBaseUrl}/api/users/unread?access_token=${Util.getAccessToken()}&conversation_id=${msg.conversation_id}`);
			vscode.commands.executeCommand("vscode-dms.refresh");
		} else if (msg.receiver == loginUser.username) {
			vscode.window.showInformationMessage(msg.sender + ': ' + msg.message);
			await axios.post(`${apiBaseUrl}/api/users/unread?access_token=${Util.getAccessToken()}&conversation_id=${msg.conversation_id}`);
			vscode.commands.executeCommand("vscode-dms.refresh");
		}
	});

	vscode.commands.registerCommand('vscode-dms.info', () => {
		const panel = vscode.window.createWebviewPanel(
			'info',
			'Information',
			vscode.ViewColumn.One,
			{}
		);
		panel.webview.html = getWebviewContent();
	});

	function getWebviewContent() {
		return `<!DOCTYPE html>
	  <html lang="en">
	  <head>
		  <meta charset="UTF-8">
		  <meta name="viewport" content="width=device-width, initial-scale=1.0">
	  </head>
	  <body>
	  <h1>VSCode DMs</h1>
	  <h2>Features</h2>
	  <ul>
		<li>Quickly sign-in through your GitHub account to get started.</li>
		<li>The extension fetches all your mutual contacts from GitHub to whom you can message right away.</li>
		<li>Know when your friends are online by simply checking their status.</li>
		<li>Share screenshots of bugs, features, or anything you wish by pasting the image in the chatbox.</li>
		<li>Share code snippets to your most recent conversation in one click.</li>
		<li>Create Group DMs (max 5 people) to collaborate and work in sync together on a project.</li>
		<li>Customize your notification settings by clicking on the notification icon of respective chats.</li>
	  </ul>
		
	  <h2>GitHub repositories</h2>
	  	<a href="https://github.com/techsyndicate/vscode-dms"><p>https://github.com/techsyndicate/vscode-dms<p></a>
		<a href="https://github.com/techsyndicate/vscode-dms-api"><p>https://github.com/techsyndicate/vscode-dms-api<p></a>
		
	  <h2>Developed by</h2>
	  <p><a style="text-decoration: none;color:white" href="https://github.com/laxyapahuja">Laxya Pahuja</a>, <a style="text-decoration: none;color:white" href="https://github.com/sheldor1510">Anshul Saha</a> and <a style="text-decoration: none;color:white" href="https://github.com/oorjitchowdhary">Oorjit Chowdhary</a></p>
	  </body>
	  </html>`;
	}

	vscode.commands.registerCommand('vscode-dms.settings', async () => {
		if (!Util.isLoggedIn()) {
			const choice = await vscode.window.showInformationMessage(
				`You need to login to GitHub to start messaging, would you like to continue?`,
				"Yes",
				"Cancel"
			);
			if (choice === "Yes") {
				authenticate();
			}
		}
		const panel = vscode.window.createWebviewPanel(
			'settings',
			'Settings',
			vscode.ViewColumn.One,
			{
				enableScripts: true
			}
		);
		panel.webview.html = get2WebviewContent();

		panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'logout':
						const choice = await vscode.window.showInformationMessage(
							"Are you sure you want to logout?",
							"Yes",
							"Cancel"
						);
						if (choice === "Yes") {
							context.globalState.update(accessTokenKey, undefined).then(() => { console.log(context.globalState.get(accessTokenKey)); });
							vscode.window.showInformationMessage('Successfully logged out.');
							vscode.commands.executeCommand("workbench.action.reloadWindow");
							vscode.commands.executeCommand("vscode-dms.refresh");
							vscode.commands.executeCommand("workbench.action.closeActiveEditor");
						}
						return;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	function get2WebviewContent() {
		return `<!DOCTYPE html>
	  <html lang="en">
	  <head>
		  <meta charset="UTF-8">
		  <meta name="viewport" content="width=device-width, initial-scale=1.0">
	  </head>
	  <style>
		button {
			height: 30px;
		}
		button:hover {
			cursor: pointer;
		}
		button:focus {
			outline: none;
		}
	  </style>
	  <body>
	  <h1>Settings</h1>		
	  <button style="width: 150px;background-color:#0066B8;color:white;border: none;" onclick="logout()">Logout</button>
	  <script>
		  const vscode = acquireVsCodeApi();
		  function logout(){
			vscode.postMessage({command: 'logout'})
		  }
	  </script>
	  </body>
	  </html>`;
	}

	vscode.commands.registerCommand('vscode-dms.sendMessage', async () => {
		const editor = vscode.window.activeTextEditor;
		const selection = editor && editor.selection;
		let code = editor?.document.getText(selection);
		// code is the code that is selected
		const choice = await vscode.window.showInformationMessage(
			"Would you like to send this code snippet to your most recent conversation?",
			"Yes",
			"Cancel"
		);

		if (choice === "Yes") {
			let loginUser = await axios.get(`${apiBaseUrl}/api/users?access_token=${Util.getAccessToken()}`);
			if (loginUser.data.chat.last_group) {
				socket.emit('send-message', JSON.stringify({
					access_token: Util.getAccessToken(),
					sender: loginUser.data.username,
					receiver: loginUser.data.chat.last_user,
					date: new Date(),
					type: "code",
					message: code,
					conversation_id: loginUser.data.chat.last_id,
					group: true
				}));
			} else {
				let conversation_id = "";
				if (loginUser.data.username < loginUser.data.chat.last_user) {
					conversation_id = `${loginUser.data.username}${loginUser.data.chat.last_user}`;
				} else {
					conversation_id = `${loginUser.data.chat.last_user}${loginUser.data.username}`;
				}
				socket.emit('send-message', JSON.stringify({
					access_token: Util.getAccessToken(),
					sender: loginUser.data.username,
					receiver: loginUser.data.chat.last_user,
					date: new Date(),
					type: "code",
					message: code,
					conversation_id: conversation_id,
					group: false
				}));
			}
			vscode.window.showInformationMessage('Your code snippet has been sent to your most recent conversation.');
			vscode.commands.executeCommand("workbench.action.webview.reloadWebviewAction");
		}
	});

	socket.on("connect", async () => {
		const socketID = await socket.id;
		const provider = new DMSidebarProvider(context.extensionUri, socketID);
		context.subscriptions.push(
			vscode.window.registerWebviewViewProvider("dm-full", provider)
		);
		vscode.commands.registerCommand("vscode-dms.refresh", () => {
			provider._view?.webview.postMessage({
				command: "refresh",
			});
		});
		return;
	});
}


export function deactivate() { }
