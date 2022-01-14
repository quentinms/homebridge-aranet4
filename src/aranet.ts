import noble from '@abandonware/noble';
import { TextDecoder } from 'util';
import {Logger} from 'homebridge';

const ARANET4_SERVICE = 'f0cd140095da4f4b9ac8aa55d312af0c';
const ARANET4_CHARACTERISTICS = 'f0cd300195da4f4b9ac8aa55d312af0c';


const MANUFACTURER_NAME = { name: 'org.bluetooth.characteristic.manufacturer_name_string', id: '2a29' };
const MODEL_NUMBER = { name: 'org.bluetooth.characteristic.model_number_string', id: '2a24' };
const SERIAL_NUMBER = { name: 'org.bluetooth.characteristic.serial_number_string', id: '2a25' };
const HARDWARE_REVISION = { name: 'org.bluetooth.characteristic.hardware_revision_string', id: '2a27' };
const FIRMWARE_REVISION = { name: 'org.bluetooth.characteristic.firmware_revision_string', id: '2a26' };
const SOFTWARE_REVISION = { name: 'org.bluetooth.characteristic.software_revision_string', id: '2a28' };

const BLUETOOTH_DEVICEINFO_SERVICE = '180a';
const BLUETOOTH_CHARACTERISTICS = [
  MANUFACTURER_NAME,
  MODEL_NUMBER,
  SERIAL_NUMBER,
  HARDWARE_REVISION,
  FIRMWARE_REVISION,
  SOFTWARE_REVISION,
].map(c => c.id);



export type Aranet4DeviceInfo = {
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  hardwareRevision: string;
  firmwareRevision: string;
  softwareRevision: string;
};

export type AranetData = {
  co2: number;
  temperature: number;
  pressure: number;
  humidity: number;
  battery: number;
};


export class Aranet4Device {
  private readonly logger: Logger;
  private static readonly decoder: TextDecoder = new TextDecoder('utf-8');

  public readonly info: Aranet4DeviceInfo;

  private readonly peripheral: noble.Peripheral;

  constructor(logger: Logger, peripheral: noble.Peripheral, info: Aranet4DeviceInfo) {
    this.logger = logger;
    this.peripheral = peripheral;
    this.info = info;
  }

  static async waitForBluetooth(logger: Logger) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('Bluetooth is not ready'));
      }, 10000); // TODO: config


      noble.on('stateChange', async (state) => {
        logger.debug(state);
        if (state === 'poweredOn') {
          return resolve(true);
        }
      });

      if (noble.state === 'poweredOn') {
        return resolve(true);
      }
    });
  }

  async waitForPeripheral() {
    if (this.peripheral.state !== 'connected') {
      this.logger.debug('Connecting to', this.peripheral.uuid, ':', this.peripheral.state);
      await this.peripheral.connectAsync();
    }
  }

  static async getAranet4Devices(logger: Logger): Promise<Aranet4Device[]> {
    const devices: Aranet4Device[] = [];

    await this.waitForBluetooth(logger);
    logger.debug('Starting to scan...');
    await noble.startScanningAsync([ARANET4_SERVICE], false);

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        noble.stopScanningAsync();
        if (devices.length === 0) {
          return reject(new Error('Did not find any devices'));
        }
        return resolve(devices);
      }, 10000); // TODO: config

      noble.on('discover', async (peripheral) => {
        logger.debug('Found Aranet4 peripheral', peripheral.uuid);
        const device: Aranet4Device = new Aranet4Device(logger, peripheral, {
          manufacturer: 'DEFAULT_MANUFACTURER',
          modelNumber: 'DEFAULT_MODEL',
          serialNumber: 'DEFAULT_SERIAL',
          hardwareRevision: 'DEFAULT_HARDWARE_REV',
          firmwareRevision: 'DEFAULT_FIRMWARE_REV',
          softwareRevision: 'DEFAULT_SOFTWARE_REV',
        });

        await device.waitForPeripheral();

        logger.debug('Connected to peripheral', peripheral.uuid);

        const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
          [BLUETOOTH_DEVICEINFO_SERVICE],
          [...BLUETOOTH_CHARACTERISTICS],
        );
        if (characteristics.length === 0) {
          return;
        }

        await Promise.all(characteristics.map(async c => {
          const d = await c.readAsync();
          const value = this.decoder.decode(d);
          switch (c.uuid) {
            case MANUFACTURER_NAME.id:
              device.info.manufacturer = value;
              break;
            case MODEL_NUMBER.id:
              device.info.modelNumber = value;
              break;
            case SERIAL_NUMBER.id:
              device.info.serialNumber = value;
              break;
            case HARDWARE_REVISION.id:
              device.info.hardwareRevision = value;
              break;
            case FIRMWARE_REVISION.id:
              device.info.firmwareRevision = value;
              break;
            case SOFTWARE_REVISION.id:
              device.info.softwareRevision = value;
              break;
          }
        }));
        logger.debug('Found device', device.info.serialNumber);
        devices.push(device);
        await peripheral.disconnectAsync();
      });
    });
  }

  async getSensorData(): Promise<AranetData> {
    await Aranet4Device.waitForBluetooth(this.logger);
    await this.waitForPeripheral();
    this.logger.debug('Connected to Aranet4', this.peripheral.uuid);

    const { characteristics } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [ARANET4_SERVICE], [ARANET4_CHARACTERISTICS],
    );
    if (characteristics.length === 0) {
      Promise.reject(new Error('Could not find matching characteristic'));
    }

    const data = await characteristics[0].readAsync();
    // From the official repo:
    // https://github.com/SAF-Tehnika-Developer/com.aranet4/blob/54ec587f49cdece2236528edf0b871c259eb220c/app.js#L175-L182
    const results = {
      'co2': data.readUInt16LE(0),
      'temperature': data.readUInt16LE(2) / 20,
      'pressure': data.readUInt16LE(4) / 10,
      'humidity': data.readUInt8(6),
      'battery': data.readUInt8(7),
    };

    await this.peripheral.disconnectAsync();
    return results;
  }
}



