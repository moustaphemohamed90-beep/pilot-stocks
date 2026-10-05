# Image pour héberger Pilote Stocks en mode serveur (données partagées).
#   docker build -t pilote-stocks .
#   docker run -d -p 3000:3000 -v pilote-donnees:/app/data -e CODE_ACCES=votrecode --restart unless-stopped pilote-stocks
FROM node:20-alpine
WORKDIR /app
COPY . .
VOLUME /app/data
EXPOSE 3000
CMD ["node", "server.js"]
