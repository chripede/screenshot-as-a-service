/*
 * phantomjs rasteriser server
 *
 * Usage:
 *   phantomjs rasterizer.js [basePath] [port] [defaultViewportSize]
 *
 * This starts an HTTP server waiting for screenshot requests
 */
var system = require('system');

var basePath = system.args[1] || '/tmp/';
var port  = system.args[2] || 3002;

var defaultViewportSize = system.args[3] || '';
defaultViewportSize = defaultViewportSize.split('x');
defaultViewportSize = {
    width: ~~defaultViewportSize[0] || 1024,
    height: ~~defaultViewportSize[1] || 600
};

var pageSettings = ['javascriptEnabled', 'loadImages', 'localToRemoteUrlAccessEnabled', 'userAgent', 'userName', 'password'];

var server, service;

server = require('webserver').create();

/*
 * Screenshot service
 *
 * Generate a screenshot file on the server under the basePath
 *
 * Usage:
 * GET /
 * url: http://www.google.com
 *
 * Optional headers:
 * filename: google.png
 * width: 1024
 * height: 600
 * clipRect: { "top": 14, "left": 3, "width": 400, "height": 300 }
 *
 * If path is omitted, the service creates it based on the url, removing the
 * protocol and replacing all slashes with dots, e.g
 * http://www.google.com => www.google.com.png
 *
 * width and height represent the viewport size. If the content exceeds these
 * boundaries and has a non-elastic style, the screenshot may have greater size.
 * Use clipRect to ensure the final size of the screenshot in pixels.
 *
 * All settings of the WebPage object can also be set using headers, e.g.:
 * javascriptEnabled: false
 * userAgent: Mozilla/5.0 (iPhone; U; CPU like Mac OS X; en) AppleWebKit/420+
 */
service = server.listen(port, function(request, response) {
    if (request.url == '/healthCheck') {
        response.statusCode = 200;
        response.write('up');
        response.close();
        return;
    }
    if (!request.headers.url) {
        response.statusCode = 400;
        response.write('Error: Request must contain an url header' + "\n");
        response.close();
        return;
    }
    //var url = request.headers.url;
    var url = "https://www.accuranker.com/";
    var path = basePath + (request.headers.filename || (url.replace(new RegExp('https?://'), '').replace(/\//g, '.') + '.png'));
    var page = new WebPage();
    var delay = request.headers.delay || 5000;
    try {
        page.viewportSize = {
            width: defaultViewportSize.width,
            height: defaultViewportSize.height
        };
        if (request.headers.clipRect) {
            page.clipRect = JSON.parse(request.headers.clipRect);
        }
        for (name in pageSettings) {
            if (value = request.headers[pageSettings[name]]) {
                value = (value == 'false') ? false : ((value == 'true') ? true : value);
                page.settings[pageSettings[name]] = value;
            }
        }
    } catch (err) {
        response.statusCode = 500;
        response.write('Error while parsing headers: ' + err.message);
        return response.close();
    }
    page.onConsoleMessage = function(msg) {
        console.log(msg);
    };
    page.open(url, function(status) {
        console.log("Delay: " + delay);
        console.log("URL:" + url);
        console.log("Status: " + status);

        if (status == 'success') {
            window.setTimeout(function () {
                var favicon = page.evaluate(function() {
                    var docHead = document.querySelector("html > head");
                    var favIcon = null;

                    favIcon = docHead.querySelector('link[href][rel="apple-touch-icon"]');
                    if (!favIcon) {
                        favIcon = docHead.querySelector('link[href][rel="icon"]');
                    }
                    if(!favIcon) {
                        favIcon = docHead.querySelector('link[href][rel="shortcut icon"]');
                    }

                    if(favIcon) {
                        return favIcon.href;
                    } else {
                        return location.origin + "/favicon.ico";
                    }
                });
                console.log(favicon);
                response.write(favicon);
                page.release();
                response.close();
            }, delay);
        } else {
            console.log("Error");
            response.write('Error: Url returned status ' + status + "\n");
            page.release();
            response.close();
        }
    });
    // must start the response now, or phantom closes the connection
    response.statusCode = 200;
    response.write('');
});
