import { DatasourceData, DataSet } from '@shared/models/widget.models';
import {TbUnit} from "@shared/models/unit.models";

export interface HACCPReport {
    startDate: string;
    endDate: string;
    devices: HACCPDeviceData[];
}

interface HACCPReading {
    timestamp: number | null;
    value: number | null;
    isOffline?: boolean;
}

interface DynamicDailyReadings {
    [time: string]: HACCPReading | null;
}

interface HACCPDeviceData {
    deviceName: string;
    max: number;
    min: number;
    readings: {
        [date: string]: DynamicDailyReadings;
    };
}

// mat table row interface
interface Reading {
    timestamp: number;
    value: number;
    isOffline?: boolean;
}

interface DailyReadings {
    [time: string]: Reading;
}

interface TdItem {
    value?: string;
    colour: string;
    isOffline?: boolean;
}

interface Row {
    time: string;
    [deviceName: string]: TdItem | string;
}

export class HaccpReportModel {

    private report: HACCPReport = {
        startDate: '',
        endDate: '',
        devices: []
    };

    // save calculating ts more than once for every device ie all might have Mon 12/08/24 10:00
    private timestampCache: Map<string, number> = new Map();

    public filterOnReportBounds(reportStart: number, reportEnd: number, rows: Row[]) {
        return rows.filter((row: Row) => {
            const timestamp = this.convertToTimestamp(row.time);
            return timestamp >= reportStart && timestamp <= reportEnd;
        });
    }

    private convertToTimestamp(dateString: string): number {
        if (this.timestampCache.has(dateString)) {
            return this.timestampCache.get(dateString)!;
        }

        const [dayOfWeek, datePart, timePart] = dateString.split(' ');
        const [day, month, year] = datePart.split('/').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        const date = new Date(2000 + year, month - 1, day, hours, minutes);
        const timestamp = date.getTime();

        this.timestampCache.set(dateString, timestamp);
        return timestamp;
    }

    public getDeviceNames(devices: HACCPDeviceData[]): string[] {
        return devices.map(device => device.deviceName);
    }

    private getStartAndEndFromData(datasource: DatasourceData[]): Date[] {
        let results = [];
        datasource.forEach((dsData: DatasourceData) => {
            let myFirstAndLast = this.firstAndLast(dsData.data);
           // console.log('myFirstAndLast', myFirstAndLast);
            if (myFirstAndLast.length > 0) {
                results.push(this.firstAndLast(dsData.data));
            }
        });

      // console.log('Debug: first and last from each datasource', results);

        let low = [];
        let high = [];
        results.forEach((result) => {
            low.push(result[0][0]);
            high.push(result[1][0]);
        });

        const lowSorted = low.sort((a, b) => a - b);
        const highSorted = high.sort((a, b) => a - b);

       // console.log('Debug: lows sorted', lowSorted);
       // console.log('Debug: highs sorted', highSorted);

        const lowest = lowSorted[0];
        const highest = highSorted[highSorted.length - 1];

       // console.log('Debug: lowest', lowest);
       // console.log('Debug: highest', highest);
       // console.log('Debug: lowest date', new Date(lowest));
       // console.log('Debug: highest date', new Date(highest));

        // the earliest and latest possible reading
        const startData = new Date(new Date(lowest).setHours(12, 0, 0));
        const endData = new Date(new Date(highest).setHours(23, 59, 59));

        return this.getDatesInRange(startData, endData);
    }

    private firstAndLast(...ds: DataSet[]): DataSet[] {
        return ds.flatMap(array => {
            if (array.length === 0) {
                return [];
            }
            if (array.length === 1) {
                return [array[0]];
            }
            return [array[0], array[array.length - 1]];
        });
    }

    public buildHaccpReport(datasourceData: DatasourceData[], timeParams: string[], offlineWindow: number): HACCPReport {
        if (datasourceData.length === 0 || datasourceData[0].data.length === 0) {
            return this.report;
        }

        try {
            const dateDatums = this.getStartAndEndFromData(datasourceData).map((d) => d.toLocaleDateString('en-CA'));
            const devices: HACCPDeviceData[] = [];
            let minDate: Date | null = null;
            let maxDate: Date | null = null;

            datasourceData.forEach((dataItem) => {
                const deviceName = dataItem.datasource.dataKeys[0].label ?? dataItem.datasource.name;
                const { maxHaccp, minHaccp } = dataItem.datasource.dataKeys[0].settings;
                const max = maxHaccp ?? 5;
                const min = minHaccp ?? -10;
                const readings: { [date: string]: DailyReadings } = {};
                const dailyReadings: { [date: string]: HACCPReading[] } = {};
                const decimalPlaces = dataItem.datasource.dataKeys[0].decimals ?? 0;
                dataItem.data.forEach((reading) => {
                    const date = this.safeDate(reading[0]);
                    let readingValue: any = '';
                    // the data should always be a number - it's not -.-
                    if (typeof reading[1] === 'string' || reading[1] instanceof String) {
                        // @ts-ignore
                        readingValue = parseFloat(reading[1]);
                    } else {
                        readingValue = reading[1];
                    }
                    if (date) {
                        const dateString = date.toLocaleDateString('en-CA');
                        if (!dailyReadings[dateString]) {
                            dailyReadings[dateString] = [];
                        }

                        dailyReadings[dateString].push({
                            timestamp: reading[0],
                            value: parseFloat(readingValue.toFixed(decimalPlaces)),
                            isOffline: false
                        });

                        if (!minDate || date < minDate) {
                            minDate = date;
                        }
                        if (!maxDate || date > maxDate) {
                            maxDate = date;
                        }
                    }
                });

                Object.keys(dailyReadings).forEach((dateString) => {
                    readings[dateString] = {};
                    timeParams.forEach((time) => {
                        readings[dateString][time] = this.getClosestReading(dailyReadings[dateString], time, dateString, offlineWindow);
                    });
                });

                // Populate missing dates with offline readings
                dateDatums.forEach(date => {
                    if (!dailyReadings[date]) {
                        readings[date] = {};
                        timeParams.forEach((time) => {
                            readings[date][time] = { timestamp: 0, value: 0, isOffline: true };
                        });
                    }
                });

                devices.push({
                    deviceName,
                    max,
                    min,
                    readings
                });
            });

            this.report.devices = devices;
            this.report.startDate = minDate ? minDate.toISOString() : '';
            this.report.endDate = maxDate ? maxDate.toISOString() : '';
            return this.report;

        } catch (e) {
            console.log('Caught exception while building report:', e);
            return this.report;
        }
    }

    // private roundToDecimalPlaces(num: number, decimalPlaces: number): string {
    //     const factor = Math.pow(10, decimalPlaces);
    //     const roundedNum = Math.round(num * factor) / factor;
    //
    //     // Convert to string and split into integer and decimal parts
    //     const [integerPart, decimalPart = ''] = roundedNum.toString().split('.');
    //
    //     // Pad the decimal part with zeros if necessary
    //     const paddedDecimalPart = decimalPart.padEnd(decimalPlaces, '0');
    //
    //     // Combine the parts and return
    //     return decimalPlaces > 0
    //         ? `${integerPart}.${paddedDecimalPart}`
    //         : integerPart;
    // }

    public getDatesInRange(startDate: Date, endDate: Date): Date[] {
        const dates: Date[] = [];
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            dates.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    }

    private safeDate(timestamp: number): Date | null {
        if (this.isValidTimestamp(timestamp)) {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        console.log('not safe date', timestamp);
        return null;
    }

    private isValidTimestamp(timestamp: number): boolean {
        return !isNaN(timestamp) && isFinite(timestamp) && timestamp > 0 && timestamp < 8640000000000000; // Max valid JS date
    }

    private getClosestReading(readings: HACCPReading[], targetTime: string, dateString: string, offlineWindow: number): HACCPReading | null {
        const allowedWindowMinutes = offlineWindow;

        const targetDate = new Date(`${dateString} ${targetTime}`);
       // console.log(`Debug: Target date ${targetDate}`);
        let closestReading: HACCPReading | null = null;
        let minDiff = Infinity;
        readings.forEach((reading) => {
            const diff = Math.abs(reading.timestamp - targetDate.getTime());

            if (diff < minDiff) {
                minDiff = diff;
                closestReading = { timestamp: reading.timestamp, value: reading.value, isOffline: reading.isOffline };
            }
        });

        if (closestReading) {
            // console.log(`Debug: Closest reading found at ${new Date(closestReading.timestamp)}`);
            const minutes = Math.floor((minDiff / 1000) / 60);
            // console.log(`Debug: tracked difference in mins: ${minutes}, allowed minutes ${allowedWindowMinutes}`);

            // we've found the closest reading, need to check the diff.
            if (minutes > allowedWindowMinutes) {
                closestReading.isOffline = true;
            }
        } else {
            console.log(`Debug: No reading found for ${dateString} ${targetTime}`);
        }

        return closestReading;
    }

    public mapToRows(
        devices: HACCPDeviceData[],
        unit: TbUnit,
        timeParams: string[],
        okColour: string,
        dangerColour: string,
        offlineColour: string,
        offlineText: string
    ): Row[] {
        const rows: Row[] = [];
        const times = timeParams;

        // Get all unique dates from the devices
        const dates = new Set<string>();
        devices.forEach(device => {
            Object.keys(device.readings).forEach(date => dates.add(date));
        });

        // Iterate over each date and time to create rows
        dates.forEach(date => {
            times.forEach(time => {
                const row: Row = { time: `${date} ${time}` };
                devices.forEach(device => {
                    const isOffline = device.readings[date][time].isOffline;
                    const value = device.readings[date]?.[time]?.value ?? null;
                    const colour = isOffline ? offlineColour :
                        this.getColour(device.readings[date][time].value, device.max, device.min, okColour, dangerColour);
                    row[device.deviceName] = { value: isOffline ? offlineText : value.toString() + ' ' + unit, isOffline, colour };
                });
                rows.push(row);
            });
        });

        // sort the rows
        this.sortRowsAscending(rows);

        // format to the spec
        return this.formatTime(rows);
    }

    private sortRowsAscending(rows: Row[]) {
        return rows.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }

    private formatTime(rows: Row[]): Row[] {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return rows.map(item => {
            const date = new Date(item.time);
            const dayName = days[date.getUTCDay()];
            const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            // eslint-disable-next-line max-len
            const fd = `${dayName} ${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;

            return {
                ...item,
                time: `${fd} ${formattedTime}`
            };
        });
    }

    // private formatDate(dateString: string): string {
    //     const date = new Date(dateString);
    //     const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    //     const dayOfWeek = dayNames[date.getUTCDay()];
    //     const day = date.getUTCDate().toString().padStart(2, '0');
    //     const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    //     const year = date.getUTCFullYear();
    //     return `${dayOfWeek} ${day}/${month}/${year}`;
    // }

    private getColour(value: number, max: number, min: number, okColour: string, dangerColour: string): string {
        if (value > max) {
            return dangerColour;
        }
        if (value < min) {
            return dangerColour;
        }
        return okColour;
    }
}
