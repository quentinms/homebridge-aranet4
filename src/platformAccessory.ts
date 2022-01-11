import { Service, PlatformAccessory } from 'homebridge';

import { Aranet4Platform } from './platform';
import noble from '@abandonware/noble';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Aranet4Accessory {
  // https://developers.homebridge.io/#/service/HumiditySensor
  private humidityService: Service;
  // https://developers.homebridge.io/#/service/TemperatureSensor
  private temperatureService: Service;
  // https://developers.homebridge.io/#/service/CarbonDioxideSensor
  private co2Service: Service;


  constructor(
    private readonly platform: Aranet4Platform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer') // TODO
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model') // TODO
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial'); // TODO

    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
      this.accessory.addService(this.platform.Service.HumiditySensor);

    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor);

    this.co2Service = this.accessory.getService(this.platform.Service.CarbonDioxideSensor) ||
      this.accessory.addService(this.platform.Service.CarbonDioxideSensor);


    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    // this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.exampleDisplayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb


    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */

    // Example: add two "motion sensor" services to the accessory
    // const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    // const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    setInterval(async () => { // TODO: run on start in addition to interval
      try {
        const data = await this.getLatestData();

        if (data.battery <= 10) { // TODO: config
          this.humidityService.updateCharacteristic(
            this.platform.Characteristic.StatusLowBattery, this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW,
          );
          this.temperatureService.updateCharacteristic(
            this.platform.Characteristic.StatusLowBattery, this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW,
          );
          this.co2Service.updateCharacteristic(
            this.platform.Characteristic.StatusLowBattery, this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW,
          );
        }

        // push the new value to HomeKit
        this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, data.humidity);


        this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, data.temperature);

        const level = this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL;
        if (data.co2 >= 900) { // TODO: settings
          this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL;
        }

        this.co2Service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideDetected, level);
        this.co2Service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideLevel, data.co2);

        this.platform.log.debug('Updated data:', data);
      } catch (err) {
        this.platform.log.debug('could not update sensor data');
      }
    }, 300_000);
  }

  ARANET4_SERVICE = 'f0cd140095da4f4b9ac8aa55d312af0c';
  ARANET4_CHARACTERISTICS = 'f0cd300195da4f4b9ac8aa55d312af0c';

  async getLatestData(): Promise<AranetData> { // TODO: put that function in library
    this.platform.log.debug(noble.state);
    if (noble.state === 'poweredOn') {
      this.platform.log.debug('Starting to scan...');
      await noble.startScanningAsync([this.ARANET4_SERVICE], false);
      const res = await this.getSensorData();
      return res;
    }
    return Promise.reject('not ready');
  }

  async getSensorData(): Promise<AranetData> {
    return new Promise((resolve, reject) => {
      noble.once('discover', async (peripheral) => {
        this.platform.log.debug('Found Aranet4');
        await peripheral.connectAsync();

        this.platform.log.debug('Connected to Aranet4');
        await noble.stopScanningAsync();

        const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
          [this.ARANET4_SERVICE], [this.ARANET4_CHARACTERISTICS],
        );
        if (characteristics.length === 0) {
          reject('Could not find matching characteristic');
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

        await peripheral.disconnectAsync();
        resolve(results);
      });
    });
  }

}

type AranetData = {
  co2: number;
  temperature: number;
  pressure: number;
  humidity: number;
  battery: number;
};

