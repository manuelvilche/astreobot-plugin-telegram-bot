'use strict';

require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const isDebug = process.env.DEBUG === 'true' || process.env.DEBUG === true;

const telegramToken = isDebug ? process.env.TELEGRAM_TOKEN_TEST : process.env.TELEGRAM_TOKEN;
const webHook = isDebug ? process.env.WEBHOOK_TEST : process.env.WEBHOOK;

const bot = new TelegramBot(telegramToken, { polling: true });
// bot.deleteWebHook();
(async () => {
	const setWebHook = await bot.setWebHook(`${webHook}/bot${telegramToken}`);
	console.log('setWebHook:', setWebHook);
})();

const commands = [

	{
		command: 'sendstats',
		description: 'Send Plugin Stats'
	},
	{
		command: 'sendopentransactions',
		description: 'Send Open Transactions'
	},
	{
		command: 'seturl',
		description: 'Set AstreoBot URL'
	},
	{
		command: 'setcronminutes',
		description: 'Set Con Minutes'
	},
	{
		command: 'getcommands',
		description: 'Get commands'
	},
	{
		command: 'getwebhook',
		description: 'Get webHook info'
	}
];

(async () => {
	const setMyCommands = await bot.setMyCommands(commands);
	console.log('setMyCommands:', setMyCommands);
})();

/* eslint-disable */
bot.on('polling_error', console.log);

const answerCallbacks = {};
const users = {};

const cronConfig = {
	question: 'Cada cuantos minutos queres que corra el cron?',
	path: 'set-cron-minutes'
};

bot.on('message', message => {

	const callback = answerCallbacks[message.chat.id];

	if(callback) {
		delete answerCallbacks[message.chat.id];
		return callback(message);
	}
});

const makeRequest = async (url, path, chatId, body = false) => {

	const method = body ? 'post' : 'get';

	axios[method](`${url}/plugin/api/${path}`, body || {})
		.catch(err => {
			bot.sendMessage(chatId, 'Error al enviar el mensaje');
			bot.sendMessage(chatId, JSON.stringify(err));
		});
};

const askCronQuestion = (chatId, askData) => {
	bot.sendMessage(chatId, askData.question).then(() => {

		answerCallbacks[chatId] = answer => {

			const { text: minutes } = answer;

			if(askData.path)
				makeRequest(askData.url, askData.path, chatId, { minutes });

		};
	});
};

const setUrl = (chatId, path, question = 'Cual es la url del bot?', ask = false) => {
	console.log('users:', users);
	bot.sendMessage(chatId, question).then(() => {

		answerCallbacks[chatId] = answer => {

			const { text: botUrl, chat, from } = answer;

			// const url = botUrl.lastIndexOf('/') !== -1 ? botUrl.substring(0, botUrl.lastIndexOf('/')) : botUrl;
			const url = botUrl;
			console.log('url:', url);
			users[chatId] = {
				url,
				lastUsed: Date.now(),
				name: chat.type === 'private' ? chat.username : chat.title,
				members: {
					[from.id]: {
						name: chat.first,
						firstName: chat.first_name,
						lastName: chat.last_name,
						username: chat.username,
						languageCode: chat.language_code
					}
				}
			};
			console.log('users:', users);
			bot.sendMessage(chatId, `La URL: ${url} se configuro correctamente`);

			if(path)
				makeRequest(url, path, chatId);

			if(ask)
				askCronQuestion(chatId, { ...cronConfig, url });
		};
	});
};

bot.onText(new RegExp('/sendstats.*'), message => {

	console.log('entro al /sendstats');

	const chatId = message.chat.id;
	const url = (users && users[chatId] && users[chatId].url) || false;
	console.log('url:', url);
	console.log('users[chatId]:', users[chatId]);
	if(!url)
		setUrl(chatId, 'send-stats');
	else
		makeRequest(url, 'send-stats', chatId);
});

bot.onText(new RegExp('/sendopentransactions.*'), message => {

	console.log('entro al /sendopentransactions');

	const chatId = message.chat.id;
	const url = (users && users[chatId] && users[chatId].url) || false;

	if(!url)
		setUrl(chatId, 'send-transactions');
	else
		makeRequest(url, 'send-transactions', chatId);
});

bot.onText(new RegExp('/seturl.*'), message => {

	console.log('entro al /seturl');

	const chatId = message.chat.id;
	const url = (users && users[chatId] && users[chatId].url) || false;

	if(url) {
		bot.sendMessage(chatId, `La url configurada es: ${url}! Queres modificarla?`, {
			reply_markup: {
				resize_keyboard: true,
				one_time_keyboard: true,
				keyboard: [['Si', 'No']]
			}
		}).then(() => {
			answerCallbacks[chatId] = answer => {

				const response = answer.text;

				if(response === 'Si')
					setUrl(chatId, null, 'Cual es la nueva url del bot?');
				else
					bot.sendMessage(chatId, `Perfecto quedo la URL: ${url}`);
			};
		});

	} else
		setUrl(chatId);
});

bot.onText(new RegExp('/setcronminutes.*'), message => {

	console.log('entro al /setcronminutes');

	const chatId = message.chat.id;
	const url = (users && users[chatId] && users[chatId].url) || false;

	if(!url)
		setUrl(chatId, 'set-cron-minutes');
	else
		askCronQuestion(chatId, { ...cronConfig, url });
});

bot.onText(new RegExp('/getusers.*'), message => {

	console.log('entro al /getusers');
	const chatId = message.chat.id;
	bot.sendMessage(chatId, JSON.stringify(users));
});

bot.onText(new RegExp('/getwebhook.*'), async message => {

	console.log('entro al /getwebhook');
	const chatId = message.chat.id;

	bot.sendMessage(chatId, JSON.stringify(await bot.getWebHookInfo()));
});

bot.onText(new RegExp('/getcommands.*'), async message => {

	console.log('entro al /getcommands');
	const chatId = message.chat.id;

	bot.sendMessage(chatId, JSON.stringify(await bot.getMyCommands()));
});
