import React from 'react';
import PropTypes from 'prop-types';
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    AreaChart,
    LineChart,
    ComposedChart,
    Line,
    Area,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Scatter,
} from 'recharts';
import { Card, CardBody, HeadingText, NrqlQuery, Spinner, AutoSizer, NerdGraphQuery } from 'nr1';

export default class StorageusagepredictionchartVisualization extends React.Component {
    // Custom props you wish to be configurable in the UI must also be defined in
    // the nr1.json file for the visualization. See docs for more details.
    static propTypes = {
        /**
         * A fill color to override the default fill color. This is an example of
         * a custom chart configuration.
         */
        accountId: PropTypes.string,
        totalQuery: PropTypes.string,
        usedQuery: PropTypes.string,
        predictionQuery: PropTypes.string,
    };

    /**
     * Restructure the data for a non-time-series, facet-based NRQL query into a
     * form accepted by the Recharts library's RadarChart.
     * (https://recharts.org/api/RadarChart).
     */
    transformDataAreaChart = (rawData, days) => {
        const total = rawData.actor.account.total.results.map(x => ({
            start: x.beginTimeSeconds,
            name: (new Date(x.beginTimeSeconds * 1000)).toLocaleDateString(),
            available: Object.values(x)[2]
        }));
        const used = rawData.actor.account.used.results.map(x => ({
            start: x.beginTimeSeconds,
            name: (new Date(x.beginTimeSeconds * 1000)).toLocaleDateString(),
            used: Object.values(x)[2]
        }));;
        const prediction = Object.values(rawData.actor.account.prediction.results[0])[0];
        let lastUsed = 0;
        let lastDate = 0;
        const final = total.reduce((pre, cur, index) => {
            const matchedUsed = used.filter(x => x.name === cur.name);
            if (matchedUsed.length > 0) {
                cur = {
                    ...cur,
                    used: matchedUsed[0].used
                }
            }

            if (index === total.length - 1) {
                cur = {
                    ...cur,
                    prediction: cur.used
                };
                lastUsed = cur.used;
                lastDate = cur.start;
            }
            return [...pre, cur];
        }, []);

        const diff = prediction - lastUsed;
        const perDayStepIncrement = diff / days;

        // append
        for (let index = 1; index <= days; index++) {
            final.push({
                name: (new Date((lastDate + index * 86400) * 1000)).toLocaleDateString(),
                prediction: lastUsed + perDayStepIncrement * index
            });
        }

        return final;
    };


    /**
     * Format the given axis tick's numeric value into a string for display.
     */
    formatTick = (value) => {
        return value.toLocaleString();
    };

    render() {
        const { accountId, totalQuery, usedQuery, predictionQuery } = this.props;

        const nrqlQueryPropsAvailable =
            accountId && totalQuery && usedQuery && predictionQuery;

        if (!nrqlQueryPropsAvailable) {
            return <EmptyState />;
        }

        // pick the days in the future
        const { groups: { daysInFutures } } = /\s*predictLinear\(.*,\s*(?<daysInFutures>\d*)\s*day(s)*\)/.exec(predictionQuery);

        const query = `
            query {
                actor {
                    account(id: ${accountId}) {
                        used: nrql(query: "${usedQuery}") {
                            results
                        }
                        total: nrql(query: "${totalQuery}") {
                            results
                        }
                        prediction: nrql(query: "${predictionQuery}") {
                            results
                        }
                    }
                }
            }
        `;

        return (
            <AutoSizer>
                {({ width, height }) => (
                    <NerdGraphQuery
                        query={query}
                        pollInterval={0}
                    >
                        {({ data, loading, error }) => {
                            if (loading) return <Spinner />;

                            if (error) {
                                console.log("🚀 ~ StorageusagepredictionchartVisualization ~ render ~ error:", error)
                                return <ErrorState />;
                            }

                            const transformedData = this.transformDataAreaChart(data, daysInFutures);

                            return (
                                <ComposedChart
                                    width={width}
                                    height={height}
                                    data={transformedData}
                                    margin={{
                                        top: 20,
                                        right: 20,
                                        bottom: 20,
                                        left: 20,
                                    }}
                                >
                                    <CartesianGrid stroke="#f5f5f5" />
                                    <XAxis dataKey="name" />
                                    <YAxis unit="GB" />
                                    <Tooltip />
                                    <Legend />
                                    <Area
                                        type="monotone"
                                        dataKey="available"
                                        fill="#038cfc"
                                        stroke="#038cfc"
                                        name="Available Storage"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="used"
                                        name="Actuals"
                                        fill="#89CFF0"
                                        stroke="#89CFF0"
                                    />
                                    <Line
                                        dot={false}
                                        activeDot={false}
                                        type="monotone"
                                        dataKey="prediction"
                                        name="Forecast"
                                        stroke="#ff7300"
                                    />
                                </ComposedChart>
                            );
                        }}
                    </NerdGraphQuery>
                )}
            </AutoSizer>
        );
    }
}

const EmptyState = () => (
    <Card className="EmptyState">
        <CardBody className="EmptyState-cardBody">
            <HeadingText
                spacingType={[HeadingText.SPACING_TYPE.LARGE]}
                type={HeadingText.TYPE.HEADING_3}
            >
                Please provide Account ID and all required queries
            </HeadingText>
            <HeadingText
                spacingType={[HeadingText.SPACING_TYPE.MEDIUM]}
                type={HeadingText.TYPE.HEADING_4}
            >
                An example NRQL queries you can try is:
            </HeadingText>
            <code>
                SELECT latest(host.disk.totalBytes)/10e8 FROM Metric WHERE entity.guid = '...' SINCE 30 days AGO TIMESERIES 1 day
            </code>
            <code>
                SELECT latest(host.diskUsedBytes)/10e8 FROM Metric WHERE entity.guid = '...' SINCE 30 days AGO TIMESERIES 1 day
            </code>
            <code>
                SELECT predictLinear(host.diskUsedBytes, 90 days)/10e8 as prediction FROM Metric WHERE entity.guid = '...'
            </code>
        </CardBody>
    </Card>
);

const ErrorState = () => (
    <Card className="ErrorState">
        <CardBody className="ErrorState-cardBody">
            <HeadingText
                className="ErrorState-headingText"
                spacingType={[HeadingText.SPACING_TYPE.LARGE]}
                type={HeadingText.TYPE.HEADING_3}
            >
                Oops! Something went wrong.
            </HeadingText>
        </CardBody>
    </Card>
);
