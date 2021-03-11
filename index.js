'use strict';

require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const express = require('express');
const mongoose = require('mongoose');

const packageInfo = require('./package.json');

mongoose.connect(process.env.MONGO_URL, {
	useUnifiedTopology: true,
	useNewUrlParser: true,
	useCreateIndex: true
});

const UserModel = mongoose.model('user', {
	chatId: { type: String, unique: true },
	url: { type: String },
	lastUsed: { type: Date },
	name: { type: String },
	members: { type: Object }
});

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const isDebug = process.env.DEBUG === 'true' || process.env.DEBUG === true;

const telegramToken = isDebug ? process.env.TELEGRAM_TOKEN_TEST : process.env.TELEGRAM_TOKEN;
const webHook = isDebug ? process.env.WEBHOOK_TEST : process.env.WEBHOOK;

const bot = new TelegramBot(telegramToken, { polling: true });

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
		description: 'Set Cron Minutes'
	},
	{
		command: 'getcommands',
		description: 'Get commands'
	}
];

(async () => {
	await bot.setWebHook(`${webHook}`);
	await bot.setMyCommands(commands);
})();

/* eslint-disable */
bot.on('polling_error', console.log);

const answerCallbacks = {};

const cronConfig = {
	question: 'Cada cuantos minutos queres que corra el cron?',
	path: 'set-cron-minutes'
};

bot.on('message', message => {

	const chatId = message.chat.id;
	const callback = answerCallbacks[chatId];

	if(callback) {
		delete answerCallbacks[chatId];
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

const findUser = async chatId => {

	const queryParams = chatId ? { chatId } : {}

	const userFounded = await UserModel.find(queryParams);

	return chatId ? userFounded[0] : userFounded;
}

const processRequest = async (path, message) => {

	const chatId = message.chat.id;
	const user = await findUser(chatId);

	if(!user && !user.url)
		await setUrl(chatId, path, false, { reply_to_message_id: message.message_id });
	else
		makeRequest(user.url, path, chatId);
}

const updateUrl = async (id, url) => {
	return UserModel.updateOne({ _id: id }, { url: url}, (err, result) => {
		if(err)
			console.error(err);
		else
			console.log('se guardo correctamente el update!');
	});
}

const setUrl = async (chatId, path, question = 'Cual es la url del bot?', ask = false, options) => {

	bot.sendMessage(chatId, question, options || {}).then(() => {

		answerCallbacks[chatId] = async answer => {

			const { text: botUrl, chat, from } = answer;

			const url = botUrl.slice(-1) === '/' ? botUrl.substring(0, (botUrl.length - 1)) : botUrl;

			const userToSave = {
				chatId,
				url,
				lastUsed: Date.now(),
				name: chat.type === 'private' ? chat.username : chat.title,
				members: {
					[from.id]: {
						firstName: from.first_name,
						lastName: from.last_name,
						username: from.username,
						languageCode: from.language_code
					}
				}
			}

			const [userFounded] = await UserModel.find({ chatId });

			if(userFounded)
				await updateUrl(userFounded._id, botUrl);
			else {
				await UserModel.create(userToSave, (err, result) => {

					if(err)
						console.error(err);
					else
						console.log('se guardo correctamente!');
				});
			}

			bot.sendMessage(chatId, `La URL: ${url} se configuro correctamente`, { reply_to_message_id: answer.message_id});

			if(path)
				makeRequest(url, path, chatId);

			if(ask)
				askCronQuestion(chatId, { ...cronConfig, url });
		};
	});
};

bot.onText(new RegExp('/sendstats.*'), async message => {
	processRequest('send-stats', message);
});

bot.onText(new RegExp('/sendopentransactions.*'), async message => {
	processRequest('send-transactions', message);
});

bot.onText(new RegExp('/seturl.*'), async message => {

	const chatId = message.chat.id;
	const user = findUser(chatId);

	const [userFounded] = await UserModel.find({ chatId });

	if(userFounded) {
		bot.sendMessage(chatId, `La url configurada es: ${userFounded.url}! Queres modificarla?`, {
			reply_markup: {
				resize_keyboard: true,
				one_time_keyboard: true,
				reply_to_message_id: message.message_id,
				keyboard: [['Si', 'No']]
			}
		}).then(() => {
			answerCallbacks[chatId] = async answer => {

				const response = answer.text;

				if(response.toLowerCase() === 'si')
					await setUrl(chatId, null, 'Cual es la nueva url del bot?', false, { reply_to_message_id: answer.message_id });
				else
					bot.sendMessage(chatId, `Perfecto quedo la URL: ${url}`);
			};
		});

	} else
		await setUrl(chatId);
});

bot.onText(new RegExp('/setcronminutes.*'), async message => {

	const chatId = message.chat.id;
	const user = findUser(chatId);

	if(!user && !user.url)
		await setUrl(chatId, 'set-cron-minutes');
	else
		askCronQuestion(chatId, { ...cronConfig, url });
});

bot.onText(new RegExp('/getcommands.*'), async message => {
	const chatId = message.chat.id;
	bot.sendMessage(chatId, JSON.stringify(await bot.getMyCommands()));
});

app.get('/', (req, res) => {
	res.json({ version: packageInfo.version });
});

app.get('/users', async (req, res) => {
	const usersFounded = await UserModel.find();
	res.json(usersFounded);
});

app.post('/update-user-url', async (req, res) => {

	const { body } = req;

	const { chatId, url } = body;

	if(!chatId || !url)
		return res.status(400).send('Invalid chatId or url');

	const [userFounded] = findUser(chatId);
	updateUrl(userFounded._id, )

	res.json(findUser());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Our app is running on port ${PORT}`);
});
