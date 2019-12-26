require('dotenv').config()
const request = require('request-promise')
const { promises: fs } = require("fs");

module.exports = {
    getTweet
}

async function getTweet(tweetId, handle, text, date) {

    let cachedTweets = []
    try {
        let file = await fs.readFile("./cache/tweets.json")
        cachedTweets = JSON.parse(file) || []
    } catch (error) {
        // otherwise, empty array is fine
        console.log(error)
    }

    let cachedTweet = cachedTweets.find(t => t.id_str === tweetId)

    // if we have a cached tweet, use that
    if (cachedTweet && !process.env.CACHE_BUST) {
        return buildTweet(cachedTweet)
    }

    // if we have env variables, go get tweet
    if (process.env.TOKEN && process.env.TOKEN_SECRET && process.env.CONSUMER_KEY && process.env.CONSUMER_SECRET) {
        // fetch tweet
        let apiURI = `https://api.twitter.com/1.1/statuses/show/${tweetId}.json`
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
            cachedTweets.push(liveTweet)
            let tweetsJSON = JSON.stringify(cachedTweets, 2, 2)
            await fs.writeFile("./cache/tweets.json", tweetsJSON)

            // build
            return buildTweet(liveTweet)

        } catch (error) {
            // unhappy path - continue to other fallbacks
            console.log(error)
        }


    }

    // see if we have text fallback
    if (handle && text && date) {
        var htmlTweet =
            `<blockquote class="twitter-tweet">
            ${text}
            <a href="https://twitter.com/${handle}/status/${tweetId}">${date}</a>
        </blockquote>
        <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`

        return htmlTweet
    }

    // finally fallback to client-side injection
    var htmlTweet =
        `<blockquote class="twitter-tweet">
        <a href="https://twitter.com/anon/status/${tweetId}"></a>
    </blockquote>
    <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`

    return htmlTweet
}

function buildTweet(tweet) {
    let moment = require("moment");

    let htmlText = tweet.text

    let dateMoment = moment(tweet.created_at, "ddd MMM D hh:mm:ss Z YYYY");
    let dateDisplay = dateMoment.format("hh:mm A · MMM D, YYYY")
    let dateMeta = dateMoment.utc().format("MMM D, YYYY hh:mm:ss (z)")

    let htmlTweet =
        `<blockquote class="static-tweet">
  <div class="tweet-header">
    <a class="tweet-profile" href="https://twitter.com/${tweet.user.screen_name}" >
      <img src="${tweet.user.profile_image_url_https}" />
    </a>
    <div class="tweet-author">
      <a class="tweet-author-name" href="https://twitter.com/${tweet.user.screen_name}" >${tweet.user.name}</a>
      <a class="tweet-author-handle" href="https://twitter.com/${tweet.user.screen_name}" >@${tweet.user.screen_name}</a>
    </div>
    <a class="tweet-bird" href="https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}">
      <div class="tweet-bird-icon" aria-label="View on Twitter" title="View on Twitter" role="presentation"></div>
    </a>
  </div>
  <p class="tweet-body">${htmlText}</p>
  <div class="tweet-footer">
    <a class="tweet-heart" href="https://twitter.com/intent/like?tweet_id=${tweet.id_str}">
      <div class="tweet-heart-icon" aria-label="Like" title="Like" role="img"></div>
    </a>
    <a class="tweet-date" href="https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}" title="Time Posted: ${dateMeta}">
      ${dateDisplay}
    </a>
  </div>
</blockquote>`

    return htmlTweet
}