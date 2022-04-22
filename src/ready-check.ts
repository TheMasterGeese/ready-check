/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

let gameUsers : StoredDocument<User>[] = [];

// Register Game Settings
Hooks.once("init", function () {
	game.settings.register("ready-check", "showChatMessagesForUserUpdates", {
		name: game.i18n.localize("READYCHECK.SettingsChatMessagesForUserUpdatesTitle"),
		hint: game.i18n.localize("READYCHECK.SettingsChatMessagesForUserUpdatesHint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean
	});

	game.settings.register("ready-check", "showChatMessagesForChecks", {
		name: game.i18n.localize("READYCHECK.SettingsChatMessagesForChecksTitle"),
		hint: game.i18n.localize("READYCHECK.SettingsChatMessagesForChecksHint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean
	});

	game.settings.register("ready-check", "playAlertForCheck", {
		name: game.i18n.localize("READYCHECK.SettingsPlayAlertForChecksTitle"),
		hint: game.i18n.localize("READYCHECK.SettingsPlayAlertForChecksHint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean
	});

	game.settings.register("ready-check", "checkAlertSoundPath", {
		name: game.i18n.localize("READYCHECK.SettingsCheckAlertSoundPathTitle"),
		hint: game.i18n.localize("READYCHECK.SettingsCheckAlertSoundPathHint"),
		scope: "world",
		config: true,
		default: 'modules/ready-check/sounds/notification.mp3',
		type: String
	});

	game.settings.register("ready-check", "enableDiscordIntegration", {
		name: game.i18n.localize("READYCHECK.SettingsEnableDiscordIntegrationTitle"),
		hint: game.i18n.localize("READYCHECK.SettingsEnableDiscordIntegrationHint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean
	});

	game.settings.register("ready-check", "statusResetOnLoad", {
		name: game.i18n.localize("READYCHECK.SettingsStatusResetOnLoadTitle"),
		hint: game.i18n.localize("READYCHECK.SettingsStatusResetOnLoadHint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean
	});
});

// Reset Status When the Game is Ready
Hooks.once("ready", async function () {

	gameUsers = game.users.contents;
	if (game.settings.get('ready-check', 'statusResetOnLoad')) {
		await setAllToNotReady();
	}
});


// Set Up Buttons and Socket Stuff
Hooks.on('renderChatLog', function () {
	createButtons();
	createSocketHandler();
});

// Update the display of the Player UI.
Hooks.on('renderPlayerList', async function () {
	await updatePlayersWindow();
});


// SET ALL USERS STATUS TO NOT READY (GM)
async function setAllToNotReady() {
	if (game.user.isGM) {
		for (let i = 0; i < gameUsers.length; i++) {
			await gameUsers[i].setFlag('ready-check', 'isReady', false);
		}
	}
}


// CREATE THE UI BUTTON FOR THE GM AND PLAYERS
function createButtons() {

	let btnTitle : string = game.i18n.localize("READYCHECK.UiChangeButton");

	if (game.user.role === 4) { //if GM
		btnTitle = game.i18n.localize("READYCHECK.UiGmButton");
	}

	const sidebarBtn = $(`<a class="crash-ready-check-sidebar" title="${btnTitle}"><i class="fas fa-hourglass-half"></i></a>`);
	const popoutBtn = $(`<a class="crash-ready-check-popout" title="${btnTitle}"><i class="fas fa-hourglass-half"></i></a>`);
	const sidebarDiv = $("#sidebar").find(".chat-control-icon");
	const popoutDiv = $("#chat-popout").find(".chat-control-icon");
	const btnAlreadyInSidebar = $("#sidebar").find(".crash-ready-check-sidebar").length > 0;
	const btnAlreadyInPopout = $("#chat-popout").find(".crash-ready-check-popout").length > 0;

	if (!btnAlreadyInSidebar) {
		sidebarDiv.before(sidebarBtn);
		jQuery(".crash-ready-check-sidebar").on("click", readyCheckOnClick);
	}

	if (!btnAlreadyInPopout) {
		popoutDiv.before(popoutBtn);
		jQuery(".crash-ready-check-popout").on("click", readyCheckOnClick);
	}

	function readyCheckOnClick(event: JQuery.ClickEvent) {
		event.preventDefault();
			if (game.user.role === 4) { displayGmDialog(); }
			else { displayStatusUpdateDialog(); }
	}
}

// CREATE THE SOCKET HANDLER
function createSocketHandler() {
	if (socket) {
		socket.on('module.ready-check', async (data : ReadyCheckUserData) => {
			if (data.action === 'check') {
				displayReadyCheckDialog(game.i18n.localize("READYCHECK.DialogContentReadyCheck") as string);
			}
			else if (data.action === 'update') {
				await processReadyResponse(data);
			}
		});
	}
}

// DISPLAY DIALOG ASKING GM WHAT THEY WANT TO DO
function displayGmDialog() {
	const buttons = {
		check: {
			icon: "<i class='fas fa-check'></i>",
			label: game.i18n.localize("READYCHECK.GmDialogButtonCheck"),
			callback: initReadyCheckDefault
		},
		status: {
			icon: "<i class='fas fa-hourglass-half'></i>",
			label: game.i18n.localize("READYCHECK.GmDialogButtonStatus"),
			callback: displayStatusUpdateDialog

		}
	};
	new Dialog({
		title: game.i18n.localize("READYCHECK.GmDialogTitle"),
		content: `<p>${game.i18n.localize("READYCHECK.GmDialogContent") as string}</p>`, 
		buttons: buttons,
		default: "check"
	}).render(true);
}

async function initReadyCheckDefault() {
	await initReadyCheck()
}

// INITIATE A READY CHECK (GM)
async function initReadyCheck(message : string = game.i18n.localize("READYCHECK.DialogContentReadyCheck")) {
	if (game.user.isGM) {
		const data = { action: 'check' };
		await setAllToNotReady();
		if (socket) {
			socket.emit('module.ready-check', data);
		}
		displayReadyCheckDialog(message);
		await playReadyCheckAlert();
	} else {
		ui.notifications.error(game.i18n.localize("READYCHECK.ErrorNotGM") as string);
	}

	if (game.settings.get('ready-check', 'enableDiscordIntegration')) {
		message = tagPlayersInScene(message);
		Hooks.callAll("sendDiscordMessage", message)
	}

}

// For every user in the game, if they have a token in the current scene, ping them as part of the ready check message.
function tagPlayersInScene(message : string) : string {
	gameUsers.forEach((user : User) => {
		const scene : Scene = game.scenes.active
		
		scene.data.tokens.forEach((token : TokenDocument) => {
			// permissions object that maps user ids to permission enums
			const tokenPermissions = game.actors.get(token.data.actorId).data.permission;
			
			// if the user owns this token, and isn't already tagged, tag them at the front of the message
			if (tokenPermissions[user.id] === 3 && !message.includes(`@${user.name}`)) {
				message = `@${user.name} ${message}`;
				
			}
		});
	});
	return message;
}

// DISPLAY STATUS UPDATE DIALOG AND SEND RESPONSE TO GM, TODO: allow an alternate ready check message to be supplied as a parameter
function displayStatusUpdateDialog() {
	const data : ReadyCheckUserData = { action: 'update', ready: false, userId: game.userId ?? ""};
	const buttons = {
		yes: {
			icon: "<i class='fas fa-check'></i>",
			label: game.i18n.localize("READYCHECK.StatusReady"),
			callback: async () => { data.ready = true; await updateReadyStatus(data); await displayStatusUpdateChatMessage(data); }// TODO: check for all users being ready, if so send GM a message
		},
		no: {
			icon: "<i class='fas fa-times'></i>",
			label: game.i18n.localize("READYCHECK.StatusNotReady"),
			callback: async () => { data.ready = false; await updateReadyStatus(data); await displayStatusUpdateChatMessage(data); }
		}
	};

	new Dialog({
		title: game.i18n.localize("READYCHECK.DialogTitleStatusUpdate"),
		content: `<p>${game.i18n.localize("READYCHECK.DialogContentStatusUpdate") as string}</p>`,
		buttons: buttons,
		default: "yes"
	}).render(true);
}

// DISPLAY READY CHECK DIALOG AND SEND RESPONSE TO GM (PLAYER)
function displayReadyCheckDialog(message: string) {
	const data: ReadyCheckUserData = { action: 'update', ready: false, userId: game.userId ?? "" };
	const buttons = {
		yes: {
			icon: "<i class='fas fa-check'></i>",
			label: game.i18n.localize("READYCHECK.StatusReady"),
			callback: async () => { data.ready = true; await updateReadyStatus(data); await displayReadyCheckChatMessage(data); }
		}
	};

	new Dialog({
		title: game.i18n.localize("READYCHECK.DialogTitleReadyCheck"),
		content: `<p>${message}</p>`,
		buttons: buttons,
		default: "yes"
	}).render(true);
}

// UPDATE USER READY STATUS
// If the user is a GM, just update it since the socket go to the sender, and none of the recipients (players)
// will have the permissions require to update user flags. If the user is not a GM, emit that socket.
async function updateReadyStatus(data: ReadyCheckUserData) {
	if (game.user.isGM) {
		await processReadyResponse(data);
	} else if (socket) {
		socket.emit('module.ready-check', data);
	}
}

// PROCESS READY CHECK RESPONSE (GM)
async function processReadyResponse(data: ReadyCheckUserData) {
	if (game.user.isGM) {
		const userToUpdate = gameUsers.find((user : User) => user.id === data.userId);
		if (!userToUpdate) {
			throw new Error(`The user with the id ${data.userId} was not found.`);
		} else {
			await userToUpdate.setFlag('ready-check', 'isReady', data.ready);
			ui.players.render();
		}
	}
}

// DISPLAY A CHAT MESSAGE WHEN A USER RESPONDS TO A READY CHECK
async function displayReadyCheckChatMessage(data: ReadyCheckUserData) {
	if (game.settings.get("ready-check", "showChatMessagesForChecks")) {
		const currentUser = gameUsers.find((user : User) => { user.id === data.userId });
		if (!currentUser) {
			throw new Error(`The user with the id ${data.userId} was not found.`);
		} else {
			const username = currentUser.data.name;
			const content = `${username} ${game.i18n.localize("READYCHECK.ChatTextCheck") as string}`;
			await ChatMessage.create({ speaker: { alias: "Ready Set Go!" }, content: content });
		}
	}
}

// DISPLAY A CHAT MESSAGE WHEN A USER UPDATES THEIR STATUS
async function displayStatusUpdateChatMessage(data: ReadyCheckUserData) {
	if (game.settings.get("ready-check", "showChatMessagesForUserUpdates")) {
		const currentUser = gameUsers.find((user : User) => user.id === data.userId);
		if (!currentUser) {
			throw new Error(`The user with the id ${data.userId} was not found.`);
		}
		const username = currentUser.data.name;
		const status = data.ready ? game.i18n.localize("READYCHECK.StatusReady") as string: game.i18n.localize("READYCHECK.StatusNotReady") as string;
		const content = `${username} ${game.i18n.localize("READYCHECK.ChatTextUserUpdate") as string} ${status}`;
		await ChatMessage.create({ speaker: { alias: "Ready Set Go!" }, content: content });
	}
}


// PLAY SOUND EFFECT ASSOCIATED WITH READY CHECK START
async function playReadyCheckAlert() {
	const playAlert = game.settings.get("ready-check", "playAlertForCheck");
	const alertSound = game.settings.get("ready-check", "checkAlertSoundPath");
	if (playAlert && !alertSound) {
		await AudioHelper.play({ src: "modules/ready-check/sounds/notification.mp3", volume: 1, autoplay: true, loop: false }, true);
	} else if (playAlert && alertSound) {
		await AudioHelper.play({ src: alertSound as string, volume: 1, autoplay: true, loop: false }, true);
	}
}


// UPDATE PLAYER UI
async function updatePlayersWindow() {
	for (let i = 0; i < gameUsers.length; i++) {
		// Is the user ready
		const ready = await gameUsers[i].getFlag('ready-check', 'isReady');
		// the Id of the current user
		const userId : string = gameUsers[i].data._id;
		// indi
		const indicator = $("#players").find(`[data-user-id=${userId}] .crash-ready-indicator`);
		const indicatorExists = indicator.length > 0;
		
		let title : string
		let classToAdd, classToRemove, iconClassToAdd, iconClassToRemove ;

		if (ready) {
			title = game.i18n.localize("READYCHECK.PlayerReady");
			classToAdd = "ready";
			classToRemove = "not-ready";
			iconClassToAdd = "fa-check";
			iconClassToRemove = "fa-times";
		} else {
			title = game.i18n.localize("READYCHECK.PlayerNotReady") as string;
			classToAdd = "not-ready";
			classToRemove = "ready";
			iconClassToAdd = "fa-times";
			iconClassToRemove = "fa-check";
		}

		if (indicatorExists) {
			$(indicator).removeClass(classToRemove);
			$(indicator).removeClass(iconClassToRemove);
			$(indicator).addClass(classToAdd);
			$(indicator).addClass(iconClassToAdd);
		} else {
			$("#players").find("[data-user-id=" + userId + "]").append(`<i class="fas ${iconClassToAdd} crash-ready-indicator ${classToAdd}" title="${title}"></i>`);
		}
	}
}

class ReadyCheckUserData {
	action = "";
	ready = false;
	userId  = "";
}
