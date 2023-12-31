#!/usr/bin/env node
import {server as WebSocketServer, connection} from "websocket"
import http from 'http';
import { UserManager } from "./UserManager";
import { OutgoingMessage, SupportedMessage as OutgoingSupportedMessages } from "./messages/outgoingMessages";
import { IncomingMessage, SupportedMessage } from "./messages/incomingMessages";
import { InMemoryStore } from "./store/inMemoryStore";

const server = http.createServer(function(request: any, response: any) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});

const userManager = new UserManager();
const store = new InMemoryStore();

server.listen(8080, function() {
    console.log((new Date()) + ' Server is listening on port 8080');
});

const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: true
});

function originIsAllowed(origin: string) {
  return true;
}

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
      // Make sure we only accept requests from an allowed origin
      request.reject();
      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
      return;
    }
    
    var connection = request.accept('echo-protocol', request.origin);
    console.log((new Date()) + ' Connection accepted.');
    connection.on('message', function(message) {
        // TODO add rate limiting logic here
        if (message.type === 'utf8') {
            try{
                messageHandler(connection, JSON.parse(message.utf8Data));
            }catch(e){

            }
            // console.log('Received Message: ' + message.utf8Data);
            // connection.sendUTF(message.utf8Data);
        }
        // else if (message.type === 'binary') {
        //     console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
        //     connection.sendBytes(message.binaryData);
        // }
    });
    connection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});

function messageHandler(ws: connection, message : IncomingMessage){
    if (message.type == SupportedMessage.JoinRoom){
        const payload = message.payload;
        userManager.addUser(payload.name, payload.userId, payload.roomId, ws);
    }
    if(message.type == SupportedMessage.SendMessage){
        const payload = message.payload;
        const user = userManager.getUser(payload.roomId, payload.userId);
        if(!user){
            console.error("user not find in db");
            return;
        }
        // payload.message
        let chat = store.addChat(payload.userId, user.name, payload.roomId, payload.message);
        if (!chat){
            return;
        }

        const OutgoingPayload: OutgoingMessage = {
            type: OutgoingSupportedMessages.AddChat,
            payload:{
                chatId: chat.id,
                roomId : payload.roomId,
                message: payload.message,
                name: user.name,
                upvotes: 0
            }
        }

        userManager.broadcast(payload.roomId, payload.userId, OutgoingPayload);
    }

    if(message.type === SupportedMessage.UpvoteMessage){
        const payload = message.payload;
        const chat = store.upvote(payload.userId, payload.roomId, payload.chatId);
        if(!chat){
            return;
        }
        
        const OutgoingPayload: OutgoingMessage = {
            type: OutgoingSupportedMessages.UpdateChat,
            payload:{
                chatId: payload.chatId,
                roomId : payload.roomId,
                upvotes: chat.upvotes.length
            }
        }

        userManager.broadcast(payload.roomId, payload.userId, OutgoingPayload);
    }

}