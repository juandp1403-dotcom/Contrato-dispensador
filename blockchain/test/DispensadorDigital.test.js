const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DispensadorDigital", function () {
  const precio = ethers.parseEther("0.05");
  let dispensador, dueno, comprador, curioso;

  beforeEach(async function () {
    [dueno, comprador, curioso] = await ethers.getSigners();
    dispensador = await (await ethers.getContractFactory("DispensadorDigital")).deploy(precio);
  });

  it("inicializa precio, dueño y ventas", async function () {
    expect(await dispensador.precioArticulo()).to.equal(precio);
    expect(await dispensador.dueno()).to.equal(dueno.address);
    expect(await dispensador.totalVentas()).to.equal(0);
  });

  it("rechaza un precio inicial de cero", async function () {
    const fabrica = await ethers.getContractFactory("DispensadorDigital");
    await expect(fabrica.deploy(0)).to.be.revertedWithCustomError(dispensador, "PrecioInvalido");
  });

  it("vende y emite CompraExitosa", async function () {
    await expect(dispensador.connect(comprador).comprar({ value: precio }))
      .to.emit(dispensador, "CompraExitosa")
      .withArgs(comprador.address, precio, 1);
    expect(await dispensador.obtenerBalance()).to.equal(precio);
  });

  it("rechaza pagos insuficientes", async function () {
    await expect(dispensador.connect(comprador).comprar({ value: precio - 1n }))
      .to.be.revertedWithCustomError(dispensador, "PagoInsuficiente")
      .withArgs(precio - 1n, precio);
  });

  it("solo el dueño retira y no retira sin saldo", async function () {
    await expect(dispensador.retirarGanancias()).to.be.revertedWithCustomError(dispensador, "SinSaldoParaRetirar");
    await dispensador.connect(comprador).comprar({ value: precio });
    await expect(dispensador.connect(curioso).retirarGanancias())
      .to.be.revertedWithCustomError(dispensador, "SoloDuenoPuedeRetirar")
      .withArgs(curioso.address);
    await expect(dispensador.retirarGanancias()).to.changeEtherBalances([dueno, dispensador], [precio, -precio]);
    expect(await dispensador.obtenerBalance()).to.equal(0);
  });
});
