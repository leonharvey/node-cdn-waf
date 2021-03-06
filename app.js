// Get free + trusted SSL certs at letsencrypt.org
const http          = require('http');
const middleware    = require(__dirname + '/middleware');
const httpProxy     = require('http-proxy');
const https         = require('https');
const request       = require('request');
const fs            = require('fs');
var pool            = require(__dirname + '/sites.json').sites;
var proxies         = [];


for (var key in pool) {
    proxies[key] = new httpProxy.createProxyServer({
        target: {
            host: pool[key].proxy_ip,
            port: pool[key].proxy_port,
        }
    });
    
    proxies[key].on('proxyReq', function(proxyReq, req, res, options) {
        proxyReq.setHeader('x-forwarded-for', req.connection.remoteAddress.replace('::ffff:', ''));
        proxyReq.setHeader('x-forwarded-proto', req.method);
        proxyReq.setHeader('Cache-Control', 'public, max-age=' + 3600 * 24 * 7);
    });
};

//Forward to host;
middleware.use(gateway);

http.createServer(middleware).listen(8080);

https.createServer({
  key: fs.readFileSync('/etc/letsencrypt/live/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/fullchain.pem')
}, middleware).listen(443);

   
function gateway(req, res, errorHandler) {
    if (typeof req.site.host_forward !=='undefined') {
        request(req.site.host_forward + req.originalUrl, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                res.setHeader('Content-Type', 'text/html');
                res.setHeader('Cache-Control', 'no-cache');
                res.write(body);
                res.flush()
                return res.end();
            }
            else {
                return res.end('An error occurred accessing the requested document');
            }
        });
    } else {
        proxies[req.host_key].web(req, res);
        
        if (typeof errorHandler !== 'undefined')
            proxies[req.host_key].on('error', errorHandler);
    }
}

module.exports = gateway;



