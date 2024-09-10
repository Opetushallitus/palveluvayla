export type EnvName = "dev" | "qa" | "prod";

export type WsdlService = {
  wsdlUrl: string;
  serviceEndpoints: Array<{
    serviceCode: string;
    endpoint: string;
  }>;
};

export type Config = {
  xroadEnvironment: "FI" | "FI-TEST" | "FI-DEV";
  testWsdlServices: Array<WsdlService>;
  testAllowedSubsystems: Array<{
    clientSubsystemId: string;
    serviceIds: string[];
  }>;
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
  testWsdlServices: [
    {
      wsdlUrl: "https://opintopolku.fi/koski/wsdl/hsl.wsdl",
      serviceEndpoints: [
        {
          serviceCode: "opintoOikeudetService.v1",
          endpoint:
            "https://oph-koski-luovutuspalvelu.opintopolku.fi/koski/api/palveluvayla/hsl",
        },
      ],
    },
    {
      wsdlUrl: "https://opintopolku.fi/koski/wsdl/suomiFiRekisteritiedot.wsdl",
      serviceEndpoints: [
        {
          serviceCode: "suomiFiRekisteritiedot.v1",
          endpoint:
            "https://oph-koski-luovutuspalvelu.opintopolku.fi/koski/api/palveluvayla/suomi-fi-rekisteritiedot",
        },
      ],
    },
  ],
  testAllowedSubsystems: [
    {
      clientSubsystemId: `FI:GOV:2769790-1:test-client`,
      serviceIds: ["opintoOikeudetService", "suomiFiRekisteritiedot"],
    },
  ],
};

const qa: Config = {
  xroadEnvironment: "FI-TEST",
  testWsdlServices: [
    {
      wsdlUrl: "https://testiopintopolku.fi/koski/wsdl/hsl.wsdl",
      serviceEndpoints: [
        {
          serviceCode: "opintoOikeudetService.v1",
          endpoint:
            "https://oph-koski-luovutuspalvelu-qa.testiopintopolku.fi/koski/api/palveluvayla/hsl",
        },
      ],
    },
    {
      wsdlUrl:
        "https://testiopintopolku.fi/koski/wsdl/suomiFiRekisteritiedot.wsdl",
      serviceEndpoints: [
        {
          serviceCode: "suomiFiRekisteritiedot.v1",
          endpoint:
            "https://oph-koski-luovutuspalvelu-qa.testiopintopolku.fi/koski/api/palveluvayla/suomi-fi-rekisteritiedot",
        },
      ],
    },
  ],
  testAllowedSubsystems: [
    {
      clientSubsystemId: `FI-TEST:GOV:2769790-1:test-client`,
      serviceIds: ["opintoOikeudetService", "suomiFiRekisteritiedot"],
    },
  ],
};

const dev: Config = {
  xroadEnvironment: "FI-DEV",
  testWsdlServices: [
    {
      wsdlUrl: "https://dev.koski.opintopolku.fi/koski/wsdl/hsl.wsdl",
      serviceEndpoints: [
        {
          serviceCode: "opintoOikeudetService.v1",
          endpoint:
            "https://oph-koski-luovutuspalvelu-dev.testiopintopolku.fi/koski/api/palveluvayla/hsl",
        },
      ],
    },
    {
      wsdlUrl:
        "https://dev.koski.opintopolku.fi/koski/wsdl/suomiFiRekisteritiedot.wsdl",
      serviceEndpoints: [
        {
          serviceCode: "suomiFiRekisteritiedot.v1",
          endpoint:
            "https://oph-koski-luovutuspalvelu-dev.testiopintopolku.fi/koski/api/palveluvayla/suomi-fi-rekisteritiedot",
        },
      ],
    },
    {
      wsdlUrl:
        "https://proxy.dev.palveluvayla.opintopolku.fi/test-service/wsdl",
      serviceEndpoints: [],
    },
  ],
  testAllowedSubsystems: [
    {
      clientSubsystemId: `FI-DEV:GOV:2769790-1:test-client`,
      serviceIds: ["opintoOikeudetService", "suomiFiRekisteritiedot", "ping"],
    },
  ],
};
