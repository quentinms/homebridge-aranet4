
const noble = require('@abandonware/noble');

noble.on('stateChange', async (state) => {
  console.log(state);
  if (state === 'poweredOn') {
    console.log('Starting to scan for 30s...');
    setTimeout(async () => {
      console.log('Stop scanning');
      await noble.stopScanningAsync();
      process.exit(0);
    }, 30_000);
    await noble.startScanningAsync([], false);
  }
});


const decoder = new TextDecoder('utf-8');
noble.on('discover', async (peripheral) => {
  console.log(`Found periphal ${peripheral.id} at address ${peripheral.address}`);

  if (peripheral.state === 'disconnected') {
    await peripheral.connectAsync();
  }

  try {
    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(['180a'], ['2a29', '2a24']);

    if (characteristics.length === 0) {
      return;
    }

    const device = {};


    await Promise.all(characteristics.map(async c => {
      const d = await c.readAsync();
      const value = decoder.decode(d);
      switch (c.uuid) {
        case '2a29':
          device.manufacturer = value;
          break;
        case '2a24':
          device.model = value;
      }
    }));

    console.log(`Connected to periphal ${peripheral.id} at address ${peripheral.address} (${device.manufacturer} ${device.model}, ${peripheral.advertisement.localName})`);

  } catch(e) {

  }

  await peripheral.disconnectAsync();
});
