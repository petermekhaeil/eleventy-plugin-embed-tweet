require('dotenv').config()
const request = require('request-promise')
const { promises: fs } = require("fs");

module.exports = {
    getTweet,
    getStyles
}

async function getStyles() {
    // get module directory
    let path = require("path")
    let moduleDir = path.parse(__filename).dir
    let stylePath = path.join(moduleDir, "/tweet.css")

    let styles = await fs.readFile(stylePath, "utf8")

    return styles
}


function minHtml(htmlSource) {
    var minify = require('html-minifier').minify;
    var result = minify(htmlSource, {
        minifyCSS: true,
        collapseWhitespace: true
    });

    return result;
}

async function getTweet(tweetId, options) {

    let cachedTweets = []
    if (options.cacheDirectory) {
        try {
            let file = await fs.readFile("./cache/tweets.json")
            cachedTweets = JSON.parse(file) || []
        } catch (error) {
            // otherwise, empty array is fine
            console.log(error)
        }
    }


    let cachedTweet = cachedTweets.find(t => t.id_str === tweetId)

    // if we have a cached tweet, use that
    if (cachedTweet && !process.env.CACHE_BUST) {
        return buildTweet(cachedTweet, options)
    }

    // TODO - reminder to add .env file with instructions
    // if we have env variables, go get tweet
    if (process.env.TOKEN && process.env.TOKEN_SECRET && process.env.CONSUMER_KEY && process.env.CONSUMER_SECRET) {
        // fetch tweet
        let apiURI = `https://api.twitter.com/1.1/statuses/show/${tweetId}.json?tweet_mode=extended`
        let oAuth = {
            token: process.env.TOKEN,
            token_secret: process.env.TOKEN_SECRET,
            consumer_key: process.env.CONSUMER_KEY,
            consumer_secret: process.env.CONSUMER_SECRET,
        }
        try {
            let resp = await request.get(apiURI, { oauth: oAuth });
            let liveTweet = JSON.parse(resp)

            // cache tweet
            if (options.cacheDirectory) {
                try {
                    cachedTweets.push(liveTweet)
                    let tweetsJSON = JSON.stringify(cachedTweets, 2, 2)
                    await fs.writeFile("./cache/tweets.json", tweetsJSON)
                } catch (error) {
                    console.log(error)
                }
            }

            // build
            return buildTweet(liveTweet, options)

        } catch (error) {
            // unhappy path - continue to other fallbacks
            console.log(error)
        }


    }

    // finally fallback to client-side injection
    var htmlTweet =
        `<blockquote class="twitter-tweet">
        <a href="https://twitter.com/anon/status/${tweetId}"></a>
    </blockquote>
    <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`

    return htmlTweet
}

async function buildTweet(tweet, options) {

    let { body, images } = getTweetContents(tweet)

    let { dateDisplay, dateMeta } = getTweetDates(tweet)

    // assign extra properties to tweet
    tweet.body = body
    tweet.images = images
    tweet.dateDisplay = dateDisplay
    tweet.dateMeta = dateMeta


    // get module directory
    let path = require("path")
    let moduleDir = path.parse(__filename).dir
    let templatePath = path.join(moduleDir, "/tweet.njk")

    // render with nunjucks
    let nunjucks = require("nunjucks")
    nunjucks.configure(moduleDir, { autoescape: true });
    htmlTweet = nunjucks.render("tweet.njk", tweet);


    // add css if requested
    if (options.useInlineStyles) {
        let styles = await getStyles()
        htmlTweet = `<style type='text/css'>${styles}</style>` + htmlTweet
    }

    // minify before returning
    let htmlMin = minHtml(htmlTweet)


    return htmlMin
}

function getTweetContents(tweet) {
    let htmlText = tweet.full_text

    let replacements = []
    let images = []

    // hashtags
    for (hashtag of tweet.entities.hashtags || []) {
        let { startPos, endPos, len } = getIndexPos(hashtag.indices)

        let oldText = htmlText.substr(startPos, len)
        let newText = `<a href="https://twitter.com/${oldText}">${oldText}</a>`

        replacements.push({ oldText, newText })
    }

    // users
    for (user of tweet.entities.user_mentions || []) {
        let { startPos, endPos, len } = getIndexPos(user.indices)

        let oldText = htmlText.substr(startPos, len)
        let newText = `<a href="https://twitter.com/hashtag/${user.screen_name}">${oldText}</a>`

        replacements.push({ oldText, newText })
    }

    // urls
    for (url of tweet.entities.urls || []) {
        let { startPos, endPos, len } = getIndexPos(url.indices)

        let oldText = htmlText.substr(startPos, len)
        let newText = `<a href="${url.expanded_url}">${url.expanded_url.replace(/https?:\/\//,"")}</a>`

        replacements.push({ oldText, newText })
    }

    // media
    for (media of tweet.entities.media || []) {
        let { startPos, endPos, len } = getIndexPos(media.indices)

        let oldText = htmlText.substr(startPos, len)
        let newText = `` // get rid of img url in tweet text

        replacements.push({ oldText, newText })
        images.push(media.media_url_https)
    }

    // make updates at the end
    for (rep of replacements) {
        htmlText = htmlText.replace(rep.oldText, rep.newText)
    }

    return { body: htmlText, images }
}

function getIndexPos(indices) {

    let startPos = indices[0];
    let endPos = indices[1];
    let len = endPos - startPos

    return {
        startPos,
        endPos,
        len
    }
}

function getTweetDates(tweet) {
    let moment = require("moment");

    let dateMoment = moment(tweet.created_at, "ddd MMM D hh:mm:ss Z YYYY");

    let dateDisplay = dateMoment.format("hh:mm A · MMM D, YYYY")
    let dateMeta = dateMoment.utc().format("MMM D, YYYY hh:mm:ss (z)")

    return { dateDisplay, dateMeta }
}