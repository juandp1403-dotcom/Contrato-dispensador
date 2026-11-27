// Exporta el ABI y el bytecode compilados de DispensadorDigital al formato que usa el frontend.
// Uso: node scripts/exportar-abi.js <archivo-destino.json>   (requiere "npx hardhat compile" antes)
const fs = require("fs");
const path = require("path");

const destino = process.argv[2];
if (!destino) {
  console.error("Uso: node scripts/exportar-abi.js <archivo-destino.json>");
  process.exit(1);
}
const artefacto = require(path.join(__dirname, "../artifacts/contracts/DispensadorDigital.sol/DispensadorDigital.json"));
const salida = { DispensadorDigital: { abi: artefacto.abi, bytecode: artefacto.bytecode } };
fs.mkdirSync(path.dirname(path.resolve(destino)), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(salida, null, 1) + "\n");
console.log(`ABI y bytecode exportados a ${destino}`);
