export type EnvName = "dev" | "qa" | "prod";

export type Config = {
  xroadEnvironment: "FI" | "FI-TEST" | "FI-DEV";
  testWsdlUrls: string[];
};

export function getConfig(env: EnvName): Config {
  switch (env) {
    case "dev":
      return dev;
    case "qa":
      return qa;
    case "prod":
      return prod;
  }
}

const prod: Config = {
  xroadEnvironment: "FI",
  testWsdlUrls: [],
};

const qa: Config = {
  xroadEnvironment: "FI-TEST",
  testWsdlUrls: [],
};

const dev: Config = {
  xroadEnvironment: "FI-DEV",
  testWsdlUrls: [
    "https://dev.koski.opintopolku.fi/koski/wsdl/hsl.wsdl",
    "https://dev.koski.opintopolku.fi/koski/wsdl/suomiFiRekisteritiedot.wsdl",
  ],
};
