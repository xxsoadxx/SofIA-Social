//Express
var express = require('express');
var app = express();
var fs = require('fs');
var request = require('request');
var cors = require('cors');
var async = require('async');
var corsOptions = {
    origin: '*' 
};
var iconv = require('iconv-lite');

app.use(cors(corsOptions));

app.use(function (req, res, next) {
   
	if (req.method == 'POST' && req.url !== '/api/report') {

		var chunks = [];

		req.on('data', function (data) {
			chunks.push(data);
		});

		req.on('end', function () {

			// Convert from an encoded buffer to js string. 
			var str = iconv.decode(new Buffer.concat(chunks), 'utf8');
			if(req.url === '/Delta/'){
				req.body = str;
				next();
			}else{
				try {
					console.log(str);
					req.body = JSON.parse(str);
					next();
				} catch (e) {
					var result = {
						success: false,
						severity:'E',
						message: 'Información recibida no valida',
						code: 'FORMAT_ERROR'
					};
					res.status(400).json(result);
				}
			}
			
			
		});
	}else{
		if(req.url === '/api/report'){
			var chunks = [];

			req.on('data', function (data) {
				chunks.push(data);
			});

			req.on('end', function () {

				// Convert from an encoded buffer to js string. 
				var str = iconv.decode(new Buffer.concat(chunks), 'utf8');

		 
				req.body = str;
				next();
			})  
		}else{
			next();
		}
		
	}
}
);

//Twitter
var Twitter = require('twitter');
var twconfig = {
    consumer_key: '475UJgh6TxCiXhvzHCNze53SQ',
    consumer_secret: 'Ndk7MMWU0sOewjN4gh66sQrBonBLtnFUelI2s6ctA1fduFiQYq',
    access_token_key: '3105774178-y3glINJskIJZ1TzUGztyMwCF4kwJ0Xui8FTzIgn',
    access_token_secret: '7AvzhoFYKHpBccAKuYYjlECsNhJv8ChNSFX5XpDM8ZV0d'
}
var tr = new Twitter(twconfig);

//MonkeyLearn
var options = {
    url: 'https://api.monkeylearn.com/v2/classifiers/cl_vwCpNjmM/classify/?sandbox=1',
    method: 'POST',
    headers: {
        'Authorization': 'Token 670246e699519178a29cd4dc6e105a4244aa5935',
        'Content-Type': 'application/json'
    },
    json: {}
};

//Configuración
var config = require('./config.js');

app.use('/Sofia', express.static('public'));

app.post('/search', function(req, res) {
		

	
		
		var xresponse = []; // to store the tweets and sentiment
		
		tr.get('search/tweets', {q: req.body.texto}, function(error, tweets, response) {
			
			for (var i = 0; i < tweets.statuses.length; i++) {
				var tweet = tweets.statuses[i];
				var isDone=false
				options.json = {"text_list": [tweet.text]}
				options.tweet = tweets.statuses[i];
				request.post(options, function optionalCallback(err, httpResponse, body) {
					if (err) {
						return console.error('failed:', err);
					}
					if(body.result.length > 0){
						var MonkeyData = body.result[0];
						console.log('Send successful!  Server responded with:'+ MonkeyData[0]);
						tweet.probability = MonkeyData[0].probability;
						tweet.label = MonkeyData[0].label;
					}else{
						tweet.probability = 0;
						tweet.label = "NotAnalized";
					}
					isDone=true
					
				});
				while(isDone === false) {
   
					require('deasync').runLoopOnce();
			    }
				io.emit('twittsearch',tweet );
			}
			res.json({});
		})
				/*
		   console.log(tweets);
		   for (var i = 0; i < tweets.statuses.length; i++) {
			   console.log("recorro");
			  var resp = {};
			  resp.tweet = tweets.statuses[i];
			  resp.sentiment = sentimentAnalysis(tweets.statuses[i].text);
			 
			  xresponse.push(resp);
			};
		
		    res.json(xresponse);
		});*/

		/*twitterClient.search(, function(data) {
			
			for (var i = 0; i < data.statuses.length; i++) {
			  var resp = {};
			  resp.tweet = data.statuses[i];
			  resp.sentiment = sentimentAnalysis(data.statuses[i].text);
			 
			  response.push(resp);
			};
		
		
		    res.json(response);
		});*/
});

app.get('/getData', function (req, res) {
    fs.readFile('./db/twitts_data.json', function read(err, data) {
        if (err) {
            throw err;
        }
        var files = JSON.parse(data);
        var i = 0;

        async.each(files, function(file, callback) {
            tr.get('statuses/show', {id: files[i].id_str}, function(error, tweets, response) {

                if (!error) {
                    files[i].exist = "S";
                    files[i].retweet_count = tweets.retweet_count;
                    files[i].favorite_count = tweets.favorite_count;
                    i++;
                    callback();
                }else{
                    if(error[0].code === 144){
                        files[i].exist = "N";
                    }else{
                        files[i].exist = "X";
                    }
                    files[i].retweet_count = 0;
                    files[i].favorite_count = 0;
                    i++;
                    callback();
                }
            });
        }, function(err){
            if( err ) {
                // One of the iterations produced an error.
                // All processing will now stop.
                console.log('A file failed to process');
            } else {
                var i = 0;
                async.each(files, function(file, callback) {
                    tr.get('statuses/retweets', {id: files[i].id_str}, function(error, tweets, response) {
                        console.log("aca " + JSON.stringify(tweets));
                        i++;
                        callback();
                    });
                }, function(err){
                    if( err ) {

                    } else{
                        res.json(files);
                    }
                })
                
            }
        });
        
    });

});

//SocketIO
var server = require('http').createServer(app);
var io = require('socket.io')(server);
io.on('connection', function(){ 
    console.log("connection");
    io.on('event', function(data){});
    io.on('disconnect', function(){});
});

//Database
db = require('diskdb');
db = db.connect('./db', ['twitts_data']);

tr.stream('statuses/filter', {track: config.topic},  function(stream) {
    stream.on('data', function(tweet) {
        options.json = {"text_list": [tweet.text]}
        request.post(options, function optionalCallback(err, httpResponse, body) {
            if (err) {
                return console.error('failed:', err);
            }
            var MonkeyData = body.result[0];
            console.log('Send successful!  Server responded with:'+ MonkeyData[0]);
            tweet.probability = MonkeyData[0].probability;
            tweet.label = MonkeyData[0].label;
            db.twitts_data.save(tweet);
            io.emit('twitt',tweet );
        });
    });

    stream.on('error', function(error) {
        console.log(error);
    });
});


server.listen(config.port);





