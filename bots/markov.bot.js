const _ = require('lodash');
const Slack = require('pico-slack');
const fs = require('fs');
const config = require('nconf');

const MARKOV_DEPTH = 6;
const SEP = '';

const SafeChannels = _.map([
	"1861",
	"arts-and-crafts",
	"always-sunny",
	"automation",
	"boardgames",
	"climbing",
	"cooking-and-baking",
	"coding",
	"design-dabblers",
	"diet-talk",
	"dnd",
	"dnd-homebrew",
	"events",
	"floofs",
	"general",
	"green-thumbs",
	"habitual-homebrewers",
	"hmmm",
	"mighty-maple-leafs",
	"myers-briggs",
	"overwatch",
	"random",
	"science",
	"the-tasting-room",
	"travel-talk",
	"vidya"
], (channel)=>`in:${channel}`).join(' ');

const toTinyNumber = (num)=>{
	const map = {'1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','0':'⁰'};
	return _.map(num.toString(), (n)=>map[n]).join('');
}

let mappings = {};

const buildMap = (msgs)=>{
	let result = { starts : [], chain : {}};
	_.each(msgs, (msg)=>{
		let words = msg.split(SEP);
		words.push(false);
		result.starts.push(_.slice(words, 0, MARKOV_DEPTH))
		let key = [];
		_.each(words, (word)=>{
			if(key.length == MARKOV_DEPTH){
				const stringkey = key.join('|');
				result.chain[stringkey] = result.chain[stringkey] || [];
				result.chain[stringkey].push(word);
			}
			key.push(word);
			if(key.length > MARKOV_DEPTH) key.shift();
		});
	})
	return result;
}

const getMapping = (username)=>{
	if(mappings[username]) return Promise.resolve({mapping : mappings[username]});
	let query = `from:${username} ${SafeChannels}`
	if(username=='hivebot') query = `${SafeChannels}`;
	return Slack.api('search.messages', {
		token : config.get('command_token'),
		query : query,
		sort : 'timestamp',
		count : 1000
	})
	.then((res)=>_.reduce(res.messages.matches, (r, msg)=>{
		const text = msg.text.replace(/(<h.+>)/gi, '').trim(); //Remove links from messages
		if(text.indexOf('uploaded a file:') !== -1) return r;  //Skip file upload messages
		if(text) r.push(text);
		return r;
	}, []))
	.then((msgs)=>{
		mappings[username] = buildMap(msgs);
		Slack.debug(`Map for ${username}bot built with ${_.size(msgs)} messages`);
		return {
			mapping : mappings[username],
			info : {
				msgs : _.size(msgs),
				chars : _.sumBy(msgs, (msg)=>msg.length)
			}
		}
	})
}

const genMessage = (mapping, info)=>{
	let msgArray = _.sample(mapping.starts);
	const chooseWord = ()=>{
		if(_.last(msgArray) === false) return _.initial(msgArray);
		const key = _.slice(msgArray, msgArray.length - MARKOV_DEPTH).join('|');
		const choiceArray = mapping.chain[key];
		if(!choiceArray) return msgArray;
		msgArray.push(_.sample(choiceArray));
		return chooseWord();
	}
	let text = chooseWord().join(SEP);
	if(info) text += `\n\nᵇᵘᶦᶫᵗ ʷᶦᵗʰ ${toTinyNumber(info.msgs)} ᵐˢᵍˢ ᵘˢᶦᶰᵍ ${toTinyNumber(info.chars)} ᶫᵉᵗᵗᵉʳˢ`;
	return text;
}

Slack.onMessage((msg)=>{
	_.each(Slack.users, (user)=>{
		if(Slack.msgHas(msg.text, `${user}bot`)){
			getMapping(user)
				.then(({mapping, info})=>genMessage(mapping, info))
				.then((text)=>Slack.msgAs(`${user}bot`, user, msg.channel, text))
				.catch((err)=>Slack.error(err))
		}
	});
	if(Slack.msgHas(msg.text, `hivebot`)){
		getMapping('hivebot')
			.then(({mapping, info})=>genMessage(mapping, info))
			.then((text)=>Slack.msgAs(`hivebot`, 'hivebot', msg.channel, text))
			.catch((err)=>Slack.error(err))
	}
});

/** Thesis Bot **/
const thesis = fs.readFileSync('./bots/katie_thesis.txt', 'utf8');
const thesisMapping = buildMap(thesis.split('\n'));
console.log(thesisMapping);
Slack.onMessage((msg)=>{
	if(Slack.msgHas(msg.text, `thesisbot`)){
		Slack.msgAs(`thesisbot`, 'pencil', msg.channel, genMessage(thesisMapping))
			.catch((err)=>Slack.error(err))
	}
});




/** Random Proc **/
const HOURS = 1000 * 60 * 60;
const sendRandomMessage = ()=>{
	const randomUser = _.sample(Slack.users);
	getMapping(randomUser)
		.then(({mapping, info})=>genMessage(mapping, info))
		.then((text)=>Slack.msgAs(`${randomUser}bot`, randomUser, 'bottin-around', text))
		.then(()=>makeTimeout())
}
const makeTimeout = ()=>setTimeout(()=>sendRandomMessage(), _.random(2,6) * HOURS);
makeTimeout();
