var utils = require('../lib/utils');
var join = require('path').join;
var fs = require('fs');
var path = require('path');
var request = require('request');
var http = require('http');
var exec = require('child_process').exec;

module.exports = function(app, useCors) {
    var rasterizerService = app.settings.rasterizerService;
    var fileCleanerService = app.settings.fileCleanerService;
    var faviconService = app.settings.faviconService;

    // routes
    app.get('/', function(req, res, next) {
        if (!req.param('url', false)) {
            return res.redirect('/usage.html');
        }

        var url = utils.url(req.param('url'));
        // required options
        var options = {
            uri: 'http://localhost:' + rasterizerService.getPort() + '/',
            headers: { url: url }
        };
        ['width', 'height', 'clipRect', 'javascriptEnabled', 'loadImages', 'localToRemoteUrlAccessEnabled', 'userAgent', 'userName', 'password', 'delay'].forEach(function(name) {
            if (req.param(name, false)) options.headers[name] = req.param(name);
        });

        var filename = 'screenshot_' + utils.md5(url + JSON.stringify(options)) + '.png';
        options.headers.filename = filename;

        var filePath = join(rasterizerService.getPath(), filename);

        var callbackUrl = req.param('callback', false) ? utils.url(req.param('callback')) : false;

        if (fs.existsSync(filePath)) {
            console.log('Request for %s - Found in cache', url);
            processImageUsingCache(filePath, res, callbackUrl, function(err) { if (err) next(err); });
            return;
        }
        console.log('Request for %s - Rasterizing it', url);
        processImageUsingRasterizer(options, filePath, res, callbackUrl, function(err) { if(err) next(err); });
    });

    app.get('/favicon', function(req, res, next) {
        var url = utils.url(req.param('url'));
        // required options
        var options = {
            uri: 'http://localhost:' + faviconService.getPort() + '/',
            headers: { url: url }
        };
        ['width', 'height', 'clipRect', 'javascriptEnabled', 'loadImages', 'localToRemoteUrlAccessEnabled', 'userAgent', 'userName', 'password', 'delay'].forEach(function(name) {
            if (req.param(name, false)) options.headers[name] = req.param(name);
        });

        var filename = 'favicon_' + utils.md5(url + JSON.stringify(options)) + '.png';
        options.headers.filename = filename;

        var filePath = join(faviconService.getPath(), filename);

        var callbackUrl = req.param('callback', false) ? utils.url(req.param('callback')) : false;

        if (fs.existsSync(filePath)) {
            console.log('Request for %s favicon - Found in cache', url);
            processImageUsingCache(filePath, res, callbackUrl, function(err) { if (err) next(err); });
            return;
        }
        console.log('Request for %s - Getting favicon', url);
        processFaviconUsingPhantom(options, filePath, res, callbackUrl, function(err) { if(err) next(err); });
    });

    app.get('*', function(req, res, next) {
        // for backwards compatibility, try redirecting to the main route if the request looks like /www.google.com
        res.redirect('/?url=' + req.url.substring(1));
    });

    var processFaviconUsingPhantom = function(rasterizerOptions, filePath, res, url, callback) {
        if (url) {
            // asynchronous
            res.send('Will post favicon to ' + url + ' when processed');
            callFavicon(rasterizerOptions, function(error) {
                if (error) return callback(error);
                postImageToUrl(filePath, url, callback);
            });
        } else {
            // synchronous
            callFavicon(rasterizerOptions, function(error) {
                if (error) return callback(error);
                sendImageInResponse(filePath, res, callback);
            });
        }
    };

    // bits of logic
    var processImageUsingCache = function(filePath, res, url, callback) {
        if (url) {
            // asynchronous
            res.send('Will post screenshot to ' + url + ' when processed');
            postImageToUrl(filePath, url, callback);
        } else {
            // synchronous
            sendImageInResponse(filePath, res, callback);
        }
    };

    var processImageUsingRasterizer = function(rasterizerOptions, filePath, res, url, callback) {
        if (url) {
            // asynchronous
            res.send('Will post screenshot to ' + url + ' when processed');
            callRasterizer(rasterizerOptions, function(error) {
                if (error) return callback(error);
                postImageToUrl(filePath, url, callback);
            });
        } else {
            // synchronous
            callRasterizer(rasterizerOptions, function(error) {
                if (error) return callback(error);
                sendImageInResponse(filePath, res, callback);
            });
        }
    };

    var callRasterizer = function(rasterizerOptions, callback) {
        request.get(rasterizerOptions, function(error, response, body) {
            if (error || response.statusCode != 200) {
                console.log('Error while requesting the rasterizer: %s', error.message);
                rasterizerService.restartService();
                return callback(new Error(body));
            }
            var inImagePath = rasterizerService.getPath() + rasterizerOptions.headers.filename;
            var outImagePath = rasterizerService.getPath() + rasterizerOptions.headers.filename;
            var gravity = "north";
            if(!fs.existsSync(inImagePath)) {
                console.log('Image not found. Returning no preview image.');
                inImagePath = 'public/no-pre.png'
                gravity = "center";
            }

            console.log('Converting to thumbnail');
            exec("convert " + inImagePath + " -filter Lanczos -thumbnail " + rasterizerOptions.headers.width + "x" + rasterizerOptions.headers.height + "^ -gravity " + gravity + " -extent " + rasterizerOptions.headers.width + "x" + rasterizerOptions.headers.height + " -unsharp 0x.5 " + outImagePath, function(error, stdout, stderr) {
                console.log('Optimizing PNG');
                exec('optipng ' + outImagePath, function(error, stdout, stderr) {
                    callback(null);
                });
            });
        });
    };

    var callFavicon = function(rasterizerOptions, callback) {
        request.get(rasterizerOptions, function(error, response, body) {
            if (error || response.statusCode != 200) {
                console.log('Error while requesting the favicon service: %s', error.message);
                faviconService.restartService();
                return callback(new Error(body));
            }
            var inImagePath = faviconService.getPath() + rasterizerOptions.headers.filename;
            var outImagePath = faviconService.getPath() + rasterizerOptions.headers.filename;
            var isIco = false;

            var iconFileUrl = response.body;
            if(/ico$/.test(iconFileUrl.toLowerCase())) {
                isIco = true;
                inImagePath += ".ico";
            }

            if(iconFileUrl.indexOf("http") != 0) {
                inImagePath = 'public/no-favicon.png'
                fs.createReadStream(inImagePath).pipe(fs.createWriteStream(outImagePath)).on('close', function() {
                    callback(null);
                });
                return;
            }

            console.log("Downloading " + iconFileUrl);
            request.get(iconFileUrl, function(error, response, body) {
                if(error || response.statusCode != 200) {
                    var isError = true;
                }

                request(iconFileUrl).pipe(fs.createWriteStream(inImagePath)).on('close', function() {
                    if(isError) {
                        console.log('Image not found. Returning no preview image.');
                        fs.unlinkSync(inImagePath);
                        inImagePath = 'public/no-favicon.png'
                        isIco = false;
                    }

                    console.log('Converting to thumbnail');
                    var convertImagePath = inImagePath + (isIco ? "[-1]": "");
                    exec("convert \"" + convertImagePath + "\" -filter Lanczos -thumbnail " + rasterizerOptions.headers.width + "x" + rasterizerOptions.headers.height + "^ -unsharp 0x.5 " + outImagePath, function(error, stdout, stderr) {
                        if(isIco) {
                            console.log('Removing ico file');
                            fs.unlinkSync(inImagePath);
                        }
                        console.log('Optimizing PNG');
                        exec('optipng ' + outImagePath, function(error, stdout, stderr) {
                            callback(null);
                        });
                    });
                });
            });

        });
    };

    var postImageToUrl = function(imagePath, url, callback) {
        console.log('Streaming image to %s', url);
        var fileStream = fs.createReadStream(imagePath);
        fileStream.on('end', function() {
            fileCleanerService.addFile(imagePath);
        });
        fileStream.on('error', function(err){
            console.log('Error while reading file: %s', err.message);
            callback(err);
        });
        fileStream.pipe(request.post(url, function(err) {
            if (err) console.log('Error while streaming screenshot: %s', err);
            callback(err);
        }));
    };

    var sendImageInResponse = function(imagePath, res, callback) {
        console.log('Sending image in response');
        if (useCors) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Expose-Headers", "Content-Type");
        }
        res.sendfile(imagePath, function(err) {
            fileCleanerService.addFile(imagePath);
            callback(err);
        });
    };

};