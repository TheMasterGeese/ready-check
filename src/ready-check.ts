/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

let gameUsers : StoredDocument<User>[] = [];


/**
 * Register all settings
 */
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

	game.settings.register("ready-check", "pauseOnReadyCheck", {
		name: game.i18n.localize("READYCHECK.SettingsPauseOnReadyCheckTitle"),
		hint: game.i18n.localize("READYCHECK.SettingsPauseOnReadyCheckHint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean
	});

	game.settings.register("ready-check", "unpauseOnAllReady", {
		name: game.i18n.localize("READYCHECK.SettingsUnpauseOnAllReadyTitle"),
		hint: game.i18n.localize("READYCHECK.SettingsUnpauseOnAllReadyHint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean
	});
});

// Render the status symbols and if the setting is enabled, reset all statuses.
Hooks.once("ready", async function () {
	gameUsers = game.users.contents;
	if (game.settings.get('ready-check', 'statusResetOnLoad')) {
		setAllToNotReady();
	}
	await updatePlayersWindow();
});


// Set Up Buttons and Socket Stuff
Hooks.on('renderChatLog', function () {
	createButtons();
	if (socket) {
		// create the socket handler
		socket.on('module.ready-check', async (data : ReadyCheckUserData) => {
			if (data.action === 'check') {
				displayReadyCheckDialog(game.i18n.localize("READYCHECK.DialogContentReadyCheck") as string);
			}
			else if (data.action === 'update') {
				await processReadyResponse(data);
			}
			else {
				console.error("Unrecognized ready check action")
			}
		});
	}
});

// Update the display of the Player UI.
Hooks.on('renderPlayerList', async function () {
	await updatePlayersWindow();
});

Hooks.on('initReadyCheck', async function (message : string = game.i18n.localize("READYCHECK.DialogContentReadyCheck")) {
	if (game.user.isGM) {
		await initReadyCheck(message);
	} else {
		ui.notifications.error(game.i18n.localize("READYCHECK.ErrorNotGM") as string);
	}
});

/**
 * Set the status of all users to "Not Ready"
 */
function setAllToNotReady() {
	gameUsers.forEach((user : User) =>  {
		user.setFlag('ready-check', 'isReady', false).catch(reason => {
			console.error(reason)
		});
	});
}



/**
 * Create the ready check buttons
 */
function createButtons() {
	//set title based on whether the user is player or GM
	const btnTitle : string = game.user.role === 4 ? game.i18n.localize("READYCHECK.UiGmButton") : game.i18n.localize("READYCHECK.UiChangeButton");
	
	const sidebarBtn = $(`<a class="crash-ready-check-sidebar" title="${btnTitle}"><i class="fas fa-hourglass-half"></i></a>`);
	const popoutBtn = $(`<a class="crash-ready-check-popout" title="${btnTitle}"><i class="fas fa-hourglass-half"></i></a>`);
	const sidebarDiv = $("#sidebar").find(".chat-control-icon");
	const popoutDiv = $("#chat-popout").find(".chat-control-icon");
	const btnAlreadyInSidebar = $("#sidebar").find(".crash-ready-check-sidebar").length > 0;
	const btnAlreadyInPopout = $("#chat-popout").find(".crash-ready-check-popout").length > 0;

	// Add the button to the sidebar if it doesn't already exist
	if (!btnAlreadyInSidebar) {
		sidebarDiv.before(sidebarBtn);
		jQuery(".crash-ready-check-sidebar").on("click", readyCheckOnClick);
	}

	// Add the button to the popout if it doesn't already exist
	if (!btnAlreadyInPopout) {
		popoutDiv.before(popoutBtn);
		jQuery(".crash-ready-check-popout").on("click", readyCheckOnClick);
	}

	/**
	 * Ready check button listener
	 * @param event the button click event
	 */
	function readyCheckOnClick(event: JQuery.ClickEvent) {
		event.preventDefault();
			if (game.user.role === 4) { displayGmDialog(); }
			else { displayStatusUpdateDialog(); }
	}
}

/**
 * Display the dialogue prompting the GM to either start ready check or set status.
 */
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

/**
 * callback function for the GM's ready check button
 */
function initReadyCheckDefault() {
	Hooks.callAll("initReadyCheck");
}

/**
 * Initiate the ready check, notifying players over discord (if setting is enabled) and in-game to set their ready status.
 * 
 * @param message The message to display in the ready check dialogue and to forward to Discord
 */
async function initReadyCheck(message : string = game.i18n.localize("READYCHECK.DialogContentReadyCheck")) {
	if (game.settings.get('ready-check', 'pauseOnReadyCheck')) {
		game.togglePause(true, true);
	}
	const data = { action: 'check' };
	setAllToNotReady();
	if (socket) {
		socket.emit('module.ready-check', data);
	}
	displayReadyCheckDialog(message);
	await playReadyCheckAlert();

	if (game.settings.get('ready-check', 'enableDiscordIntegration')) {
		// For every user in the game, if they have a token in the current scene, ping them as part of the ready check message.
		getUsersWithTokenInScene().forEach((user : User) => {
			message = `@${user.name} ${message}`;
		});

		Hooks.callAll("sendDiscordMessage", message)
	}
}

/**
 * Gets an array of users that have a token in the current scene.
 * @returns The array of users
 */
function getUsersWithTokenInScene() : User[] {
	const usersInScene : User[] = [];
	gameUsers.forEach((user : User) => {
		const scene : Scene = game.scenes.active
		scene.data.tokens.forEach((token : TokenDocument) => {
			// permissions object that maps user ids to permission enums
			const tokenPermissions = game.actors.get(token.data.actorId).data.permission;
			
			// if the user owns this token, then they are in the scene.
			if (tokenPermissions[user.id] === 3 && !usersInScene.includes(user)) {
				usersInScene.push(user);
			}
		});
	});
	return usersInScene;
}

/**
 * Set up the dialogue to update your ready status.
 */
function displayStatusUpdateDialog() {
	const data : ReadyCheckUserData = { action: 'update', ready: false, userId: game.userId ?? ""};
	const buttons = {
		yes: {
			icon: "<i class='fas fa-check'></i>",
			label: game.i18n.localize("READYCHECK.StatusReady"),
			callback: async () => { data.ready = true; await updateReadyStatus(data); await displayStatusUpdateChatMessage(data); }
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

// 
/**
 * Display the dialogue asking each user if they are ready
 * 
 * @param message The message to display on the dialogue.
 */
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

/**
 * button listener that pdates a user's ready status.
 * @param data button click event data
 */
async function updateReadyStatus(data: ReadyCheckUserData) {
	// If the user is a GM, just update it since the socket go to the sender, and none of the recipients (players)
	// will have the permissions require to update user flags. If the user is not a GM, emit that socket.
	if (game.user.isGM) {
		await processReadyResponse(data);
	} else if (socket) {
		socket.emit('module.ready-check', data);
	}
}

/**
 * Process a (GM)'s ready repsonse.
 * @param data 
 */
async function processReadyResponse(data: ReadyCheckUserData) {
	if (game.user.isGM) {
		const userToUpdate = gameUsers.find((user : User) => user.id === data.userId);
		if (userToUpdate) {
			await userToUpdate.setFlag('ready-check', 'isReady', data.ready);
			ui.players.render();
			let message : string;
			if (allUsersInSceneReady()) {
				// Pause the game if the setting to do so is enabled.
				if (game.settings.get('ready-check', 'unpauseOnAllReady')) {
					game.togglePause(false, true);
				}
				// Send a message to the GM indicating that all users are ready.
				message = `@${game.user.name as string} `.concat(game.i18n.localize("READYCHECK.AllPlayersReady") as string);
				Hooks.callAll("sendDiscordMessage", message);
			}
		} else {
			console.error(`The user with the id ${data.userId} was not found.`);
		}
	}
}

/**
 * Checks if all users in a scene are ready.
 * @returns Returns true if all users are ready, false otherwise.
 */
function allUsersInSceneReady() : boolean {
	let usersReady = true;
	const sceneUsers = getUsersWithTokenInScene();
	sceneUsers.forEach((user : User) => {
		if (!user.getFlag('ready-check', 'isReady')) {
			usersReady = false;
		}
	});
	return usersReady;
}


/**
 * Displays a chat message when a user responds to a ready check
 * 
 * @param data event data from clicking either of the buttons to indicate ready/not ready
 */
async function displayReadyCheckChatMessage(data: ReadyCheckUserData) {
	if (game.settings.get("ready-check", "showChatMessagesForChecks")) {
		// Find the current user
		const currentUser = gameUsers.find((user : User) => { user.id === data.userId });
		if (currentUser) {
			const username = currentUser.data.name;
			const content = `${username} ${game.i18n.localize("READYCHECK.ChatTextCheck") as string}`;
			await ChatMessage.create({ speaker: { alias: "Ready Set Go!" }, content: content });
		} else {
			throw new Error(`The user with the id ${data.userId} was not found.`);
		}
	}
}


/**
 * Display a chat message when a user updates their status.
 * @param data event data from clicking either of the buttons to indicate ready/not ready
 */
async function displayStatusUpdateChatMessage(data: ReadyCheckUserData) {
	if (game.settings.get("ready-check", "showChatMessagesForUserUpdates")) {
		const currentUser = gameUsers.find((user : User) => user.id === data.userId);
		if (currentUser) {
			const username = currentUser.data.name;
			const status = data.ready ? game.i18n.localize("READYCHECK.StatusReady") as string: game.i18n.localize("READYCHECK.StatusNotReady") as string;
			const content = `${username} ${game.i18n.localize("READYCHECK.ChatTextUserUpdate") as string} ${status}`;
			await ChatMessage.create({ speaker: { alias: "Ready Set Go!" }, content: content });
		} else {
			throw new Error(`The user with the id ${data.userId} was not found.`);
		}
	}
}

/**
 * Play sound effect associated with ready check start
 */
async function playReadyCheckAlert() {
	const playAlert = game.settings.get("ready-check", "playAlertForCheck");
	const alertSound = game.settings.get("ready-check", "checkAlertSoundPath");
	if (playAlert && !alertSound) {
		await AudioHelper.play({ src: "modules/ready-check/sounds/notification.mp3", volume: 1, autoplay: true, loop: false }, true);
	} else if (playAlert && alertSound) {
		await AudioHelper.play({ src: alertSound as string, volume: 1, autoplay: true, loop: false }, true);
	}
}

/**
 * Updates the ui of each player's ready status.
 */
async function updatePlayersWindow() {
	for (let i = 0; i < gameUsers.length; i++) {
		// Is the user ready
		const ready = await gameUsers[i].getFlag('ready-check', 'isReady');
		// the Id of the current user
		const userId : string = gameUsers[i].data._id;

		// get the ready/not ready indicator
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
			// Create a new indicator
			$("#players").find("[data-user-id=" + userId + "]").append(`<i class="fas ${iconClassToAdd} crash-ready-indicator ${classToAdd}" title="${title}"></i>`);
		}
	}
}

/**
 * data passed to button listener functions
 */
class ReadyCheckUserData {
	action = "";
	ready = false;
	userId  = "";
}
