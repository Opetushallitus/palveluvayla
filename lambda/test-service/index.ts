import * as lambda from "aws-lambda";

const fqdn = process.env["FQDN"];
const mountPath = process.env["MOUNT_PATH"];

exports.handler = async function (
  event: lambda.APIGatewayProxyEventV2
): Promise<lambda.APIGatewayProxyResultV2> {
  if (event.rawPath.endsWith("/wsdl")) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/xml" },
      body: `
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                  xmlns:xrd="http://x-road.eu/xsd/xroad.xsd"
                  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                  name="pingService">
    <wsdl:types>
        <xsd:schema elementFormDefault="qualified" targetNamespace="http://test.x-road.global/producer">
            <xsd:import id="xrd" namespace="http://x-road.eu/xsd/xroad.xsd" schemaLocation="http://x-road.eu/xsd/xroad.xsd"/>
            <xsd:element name="pingRequest" type="xsd:string"/>
            <xsd:element name="pingResponse" type="xsd:string"/>
        </xsd:schema>
    </wsdl:types>

    <wsdl:message name="requestheader">
        <wsdl:part name="client" element="xrd:client"/>
        <wsdl:part name="service" element="xrd:service"/>
        <wsdl:part name="userId" element="xrd:userId"/>
        <wsdl:part name="id" element="xrd:id"/>
        <wsdl:part name="issue" element="xrd:issue"/>
        <wsdl:part name="protocolVersion" element="xrd:protocolVersion"/>
    </wsdl:message>

    <wsdl:message name="pingRequestMessage">
        <wsdl:part name="parameters" element="xrd:pingRequest"/>
    </wsdl:message>
    <wsdl:message name="pingResponseMessage">
        <wsdl:part name="parameters" element="xrd:pingResponse"/>
    </wsdl:message>

    <wsdl:portType name="pingPortType">
        <wsdl:operation name="ping">
            <wsdl:input message="tns:pingRequestMessage"/>
            <wsdl:output message="tns:pingResponseMessage"/>
        </wsdl:operation>
    </wsdl:portType>

    <wsdl:binding name="pingBinding" type="tns:pingPortType">
        <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
        <wsdl:operation name="ping">
            <soap:operation soapAction=""/>
            <xrd:version>v1</xrd:version>
            <wsdl:input>
                <soap:body parts="body" use="literal"/>
                <soap:header message="tns:requestheader" part="client" use="literal"/>
                <soap:header message="tns:requestheader" part="service" use="literal"/>
                <soap:header message="tns:requestheader" part="userId" use="literal"/>
                <soap:header message="tns:requestheader" part="id" use="literal"/>
                <soap:header message="tns:requestheader" part="issue" use="literal"/>
                <soap:header message="tns:requestheader" part="protocolVersion" use="literal"/>
            </wsdl:input>
            <wsdl:output>
                <soap:body parts="body" use="literal"/>
                <soap:header message="tns:requestheader" part="client" use="literal"/>
                <soap:header message="tns:requestheader" part="service" use="literal"/>
                <soap:header message="tns:requestheader" part="userId" use="literal"/>
                <soap:header message="tns:requestheader" part="id" use="literal"/>
                <soap:header message="tns:requestheader" part="issue" use="literal"/>
                <soap:header message="tns:requestheader" part="protocolVersion" use="literal"/>
            </wsdl:output>
        </wsdl:operation>
    </wsdl:binding>
    <wsdl:service name="pingService">
        <wsdl:port binding="tns:pingBinding" name="pingPort">
            <soap:address location="https://${fqdn}${mountPath}/ping"/>
        </wsdl:port>
    </wsdl:service>
</wsdl:definitions>`,
    };
  } else if (event.rawPath.endsWith("/ping")) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/xml" },
      body: `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:tns="http://example.com/pingpong"
                  xmlns:id="http://x-road.eu/xsd/identifiers"
                  xmlns:xro="http://x-road.eu/xsd/xroad.xsd">
   <soapenv:Header>
     <xro:protocolVersion>4.0</xro:protocolVersion>
     <xro:userId>123456789</xro:userId>
     <xro:id>ID123456</xro:id>
     <xro:client id:objectType="SUBSYSTEM">
       <id:xRoadInstance>FI-DEV</id:xRoadInstance>
       <id:memberClass>GOV</id:memberClass>
       <id:memberCode>2769790-1</id:memberCode>
       <id:subsystemCode>test-client</id:subsystemCode>
     </xro:client>
     <xro:service id:objectType="SERVICE">
       <id:xRoadInstance>FI-DEV</id:xRoadInstance>
       <id:memberClass>GOV</id:memberClass>
       <id:memberCode>2769790-1</id:memberCode>
       <id:subsystemCode>test-service</id:subsystemCode>
       <id:serviceCode>ping</id:serviceCode>
       <id:serviceVersion>v1</id:serviceVersion>
     </xro:service>
   </soapenv:Header>
   <soapenv:Body>
      <tns:pingResponse/>
   </soapenv:Body>
</soapenv:Envelope>`,
    };
  } else {
    return {
      statusCode: 404,
    };
  }
};
