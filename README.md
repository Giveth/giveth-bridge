# Giveth Bridge

Giveth specific bridge between 2 ethereum based blockchains

# Config

See `config/default.json` for example. This will be loaded and extended by additional configuration if found. You can specify the `ENVIRONMENT` env variable to load the file `config/${ENVIRONMENT}.json` if found. `ENVIRONMENT` defaults to `local`.

`homeNodeUrl`: ethereum node connection url for homeBridge
`homeBridge`: address of the home bridge
`homeConfirmations`: # of confirmations required before relaying tx to foreignBridge
`foreignNodeUrl`: ethereum node connection url for foreignBridge
`foreignBridge`: address of the foreign bridge
`foreignConfirmations`: # of confirmations required before relaying tx to homeBridge
`pollTime`: how often in seconds to check for txs to relay
`liqidPledging`: address of liquidPledging contract on foreign network

If you would like to receive an email on any errors, the following are required:

    `mailApiKey`: mailgun api key
    `mailDomain`: mailgun domain
    `mailFrom`: address to send mail from
    `mailTo`: address sto send mail to

## Help
Reach out to us on [join](http://join.giveth.io) for any help or to share ideas.
