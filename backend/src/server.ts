import server = require('./app');

const PORT = Number(process.env.PORT) || 3000;

server.listen(PORT, () => {
  console.log(`Eagle Fly server running on port ${PORT}`);
});
