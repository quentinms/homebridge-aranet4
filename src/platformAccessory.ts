import { Service, PlatformAccessory } from 'homebridge';

import { Aranet4Platform } from './platform';
import { Aranet4Device, AranetData } from './aranet';

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

  private readonly services: Service[];

  constructor(
    private readonly platform: Aranet4Platform,
    private readonly accessory: PlatformAccessory,
    private readonly device: Aranet4Device,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, device.info.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, device.info.modelNumber)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.info.serialNumber)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, device.info.firmwareRevision);

    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
      this.accessory.addService(this.platform.Service.HumiditySensor);

    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor);

    this.co2Service = this.accessory.getService(this.platform.Service.CarbonDioxideSensor) ||
      this.accessory.addService(this.platform.Service.CarbonDioxideSensor);

    this.services = [
      this.humidityService,
      this.temperatureService,
      this.co2Service,
    ];

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

    setInterval(async () => {
      await this.updateSensorData();
    }, this.platform.config.sensorDataRefreshInterval * 1000);
  }

  async updateSensorData() {
    try {
      let data: AranetData;
      try {
        data = await this.device.getSensorData(this.platform.config.bluetoothReadyTimeout);
      } catch (err) {
        this.platform.log.error('could not get sensor data ' + err);
        return;
      }

      let batteryLevel = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      if (data.battery <= this.platform.config.batteryAlertThreshold) {
        batteryLevel = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
      }
      this.services.forEach(s => {
        s.updateCharacteristic(
          this.platform.Characteristic.StatusLowBattery,
          batteryLevel,
        );
      });

      // push the new value to HomeKit
      this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, data.humidity);

      this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, data.temperature);

      const level = this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL;
      if (data.co2 >= this.platform.config.co2AlertThreshold) {
        this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL;
      }

      this.co2Service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideDetected, level);
      this.co2Service.updateCharacteristic(this.platform.Characteristic.CarbonDioxideLevel, data.co2);

      this.platform.log.debug('Updated data:', data);
    } catch (err) {
      this.platform.log.error('could not update sensor data: ', err);
    }
  }
}
