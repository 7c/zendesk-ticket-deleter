var ZD = require('node-zendesk')
var debug = require('debug')('main')
var chalk = require('chalk')
var argv = require('minimist')(process.argv.slice(2))
var username,apikey,apiurl
var deleteDays = 120


Date.prototype.yyyymmdd = function(seperator="") {
        var mm = this.getMonth() + 1; // getMonth() is zero-based
        var dd = this.getDate();
        return [this.getFullYear(),(mm>9 ? '' : '0') + mm,(dd>9 ? '' : '0') + dd,].join(seperator)
}

function wait(seconds=1){
    return new Promise((resolve,reject)=>{
      setTimeout(resolve,seconds*1000)  
    })
}


function deleteTicket(zendesk,ticket) {
    return new Promise(async function (resolve,reject) {
        if (ticket && ticket.hasOwnProperty("id") && ticket.hasOwnProperty('updated_at')) {
            debug(`deleteTicket ${ticket.id}`)
            zendesk.tickets.delete(ticket.id,(err)=>{
                if (err) return reject(err)
                resolve(true)
                return
            })
        } else reject('unknown ticket')
    })
}

async function start() {
    try {
        username = argv.username ? argv.username : process.env.zd_username ? process.env.zd_username : false
        apikey = argv.apikey ? argv.apikey : process.env.zd_apikey ? process.env.zd_apikey : false
        apiurl = argv.apiurl ? argv.apiurl : process.env.zd_apiurl ? process.env.zd_apiurl : false
        if (argv.days && parseInt(argv.days)>0) deleteDays = parseInt(argv.days)


        if (!username || !apikey || !apiurl) {
            console.log(chalk.bold.blue('Usage:'))
            console.log(chalk.bold("node zendesk-ticket-deleter.js [--username 'username'] [--apikey 'apikey'] [--apiur 'https://remote.zendesk.com/api/v2'"))
            console.log(chalk.gray(''))
            console.log(chalk.gray(`You may define 'zd_username' environment variable to define username`))
            console.log(chalk.gray(`You may define 'zd_apikey' environment variable to define apikey`))
            console.log(chalk.gray(`You may define 'zd_apiurl' environment variable to define apiurl`))
            process.exit(0)
        }
        // just for safety
        if (parseInt(deleteDays)<30) {
            console.log(chalk.red(`Warning: delete days value ${deleteDays} is too low`))
            process.exit(0)
        }


        debug(`username=${username}`)
        debug(`apikey=${apikey}`)
        debug(`apiurl=${apiurl}`)
        debug(`deleteDays=${deleteDays}`)
        
        var zendesk = ZD.createClient({
            username,
            token:apikey,
            remoteUri:apiurl
        })
        var deleteBefore = new Date((Date.now()-deleteDays*24*60*60*1000)).yyyymmdd('-')
        console.log(chalk.green(`Searching tickets they have been updated before ${deleteBefore}`))


        var observer = {
            error: console.error,
            next: async function(status, body, response, result, nextPage) {
                if (status===200 && body.length>0) {
                    for(var ticket of body)
                    {
                        try {
                            await deleteTicket(zendesk,ticket)
                            console.log(chalk.green(`deleted ticket #${ticket.id}, last update ${ticket.updated_at}`))
                            // zendesk api rate limit 200 hits / minute
                            await wait(2)
                        }catch(err2) {
                            if (err2.statusCode===404) {
                                console.log(chalk.red(`ticket #${ticket.id} not found, skipped`))
                                continue
                            }
                            if (err2.statusCode===429) {
                                console.log(chalk.red(`API Rate limited`),err2.toString())
                                process.exit(0)
                            }
                            console.log(`Exception by deleting the ticket ${ticket.id}`)
                            console.log(ticket)
                            console.log(err2)
                            
                            process.exit(0)
                        }
                    }
                }
                // console.log(status,body.length,response.length)
            //   console.log(JSON.stringify(body, null, 2, true));
              console.log('Next page:', nextPage);
            },
            complete: function(statusList, body, responseList, resultList) {
              console.log(chalk.green(`successfully processed`))
              process.exit(0)
            }
        }

        // initite the search
        zendesk.search.queryAll(`type:ticket updated<"${deleteBefore}"`,observer)
    } catch(err) {
        console.log(chalk.red(err))
    }
}

start()
