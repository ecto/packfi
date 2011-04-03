var express = require('express'),
	app = express.createServer(),
	redis = require('redis-node'),
	db = redis.createClient();

app.use(express.cookieDecoder());
app.use(express.bodyDecoder());
app.use(express.session({ secret: 'execution' }));
//app.use(express.logger());
app.use(express.staticProvider(__dirname + '/static'));
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

//
// helper functions
//

app.dynamicHelpers({
  message: function(req){
    var err = req.session.error
      , msg = req.session.success;
    delete req.session.error;
    delete req.session.success;
    if (err) return '<p class="msg error">' + err + '</p>';
    if (msg) return '<p class="msg success">' + msg + '</p>';
  }
});

function restrict(req, res, next) {
	if (req.session.user) {
		next();
	} else {
		res.redirect('/');
	}
}

function authenticate(name, pass, fn) {
	console.log(name + ' authenticating');
	db.get('username:' + name, function(err, id){
		console.log(id);
		if (err || !id || id == null || id == 'null') {
			fn(new Error('That username doesn\'t exist'));
		} else {
			db.hgetall('member:' + id, function(err, user){
				if (err) { fn('Database error'); }
				if (pass == user.password) {
					fn(null, user);
				} else {
					fn('Incorrect password');
				}
			});
		}
	});
}

function newUser(form, fn) {
	console.log(form);
	if (form.first && form.last && form.username && form.email && form.password && form.password2 && form.invite) {
		if (form.password == form.password2) {
			if (form.invite == 'bananas') {
				db.get('username:' + form.username, function(err, response){
					if (response == null || response == 'null') {
						createUser(form, fn);
					} else {
						fn('The username you requested has already been taken.');
					}
				});
			} else {
				fn('Incorrect invitation code.');
			}
		} else {
			fn('The passwords you entered did not match.');
		}		
	} else {
		fn('You need to fill out all of the fields.');
	}
}

function createUser(form, fn) {
	db.incr('members', function(err, id){
		db.set('username:' + form.username, id);
		db.hmset('member:' + id,
			{id: id,
			username: form.username,
			password: form.password,
			email: form.email,
			firstName: form.first,
			lastName: form.last,
			karma: 0,
			unread: 0,
			picture: 'default' },
			function(err, reply){
				getUser(id, function(user){
					fn(null, user);
				});
			});
	});
}

function getUser(id, fn) {
	db.hgetall('member:' + id, function(err, user){
		fn(user);
	});
}



//
// routing table
//



app.get('/', function(req, res){
	if (req.session.user) {
		res.render('home', { locals: { user: req.session.user }});
	} else {
		res.render('index', { layout: false });
	}
});

app.post('/login', function (req, res) {
	authenticate(req.body.username, req.body.password, function(err, user){
		if (user) {
			req.session.regenerate(function(){
				req.session.user = user;
				res.redirect('back');
			});
		} else {
			req.session.error = err;
			res.redirect('back');
		}
	});
});

app.post('/signup', function (req, res) {
	newUser(req.body, function(err, user){
		if (user) {
			req.session.regenerate(function(){
				req.session.user = user;
				res.redirect('back');
			});
		} else {
			req.session.error = err;
			res.redirect('back');
		}
	});
});

app.get('/logout', function (req, res){
	req.session.destroy(function(){
		res.redirect('home');
	});
});

app.post('/chat/:group', function (req, res){
	if (req.body.message && req.body.author && req.params.group) {
		db.incr('chats', function(err, chatId){
			var newChat = { id: chatId, author: req.body.author, message: req.body.message };
			db.hmset('chat:' + chatId, newChat, function(err, response){
				db.lpush('group:' + req.params.group + ':chats', String(chatId), function(err, response){
					if (err) { console.log(err); }
					else {
						console.log(newChat.id);
						res.send(newChat);
					}
				});
			});
		});
	} else {
		res.send('Huh?');
	}
});

app.get('/chat/:group', function(req, res){
	var chatBuffer = [];
	db.lrange('group:' + req.params.group + ':chats', 0, -1, function(err, chats){
		for (var i in chats) {
			db.hgetall('chat:' + chats[i], function(err, chat){
				getUser(chat.author, function(user){
					chat.user = user;
					chatBuffer.push(chat);
					if (chatBuffer.length == 20 || chatBuffer.length == chats.length - 1) {
						res.send(chatBuffer);
					}
				});
			});
		}
	});
});

app.get('/profile/:id', restrict, function(req, res){
	if (req.params.id) {
		getUser(req.params.id, function(member){
			res.render('profile', { locals: { user: req.session.user, member: member } });
		});
	} else {
		next();
	}
});

app.get('/profile', restrict, function(req, res){
	res.render('myProfile', { locals: { user: req.session.user } });
});

app.listen(3000);
