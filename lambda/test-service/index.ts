import * as lambda from "aws-lambda";

const fqdn = process.env["FQDN"];
const mountPath = process.env["MOUNT_PATH"];

exports.handler = async function (
  event: lambda.APIGatewayProxyEventV2
): Promise<lambda.APIGatewayProxyResultV2> {
  if (event.rawPath.endsWith("/wsdl")) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/xml" },
      body: `
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:tns="http://test.x-road.global/producer" xmlns:xrd="http://x-road.eu/xsd/xroad.xsd" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:id="http://x-road.eu/xsd/identifiers" name="testService" targetNamespace="http://test.x-road.global/producer">
    <wsdl:types>
        <xsd:schema elementFormDefault="qualified" targetNamespace="http://test.x-road.global/producer">
            <xsd:import id="xrd" namespace="http://x-road.eu/xsd/xroad.xsd" schemaLocation="http://x-road.eu/xsd/xroad.xsd"/>
            <xsd:element name="ping">
                <xsd:complexType/>
            </xsd:element>
            <xsd:element name="pingResponse">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="data" type="xsd:string">
                            <xsd:annotation>
                                <xsd:documentation>
                                    Service response
                                </xsd:documentation>
                                <xsd:appinfo>
                                    <xrd:title xml:lang="en">Random number response</xrd:title>
                                </xsd:appinfo>
                            </xsd:annotation>
                        </xsd:element>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
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

    <wsdl:message name="ping">
        <wsdl:part name="body" element="tns:ping"/>
    </wsdl:message>
    <wsdl:message name="pingResponse">
        <wsdl:part name="body" element="tns:pingResponse"/>
    </wsdl:message>

    <wsdl:portType name="testServicePortType">
        <wsdl:operation name="ping">
            <wsdl:documentation>
                <xrd:title xml:lang="en">Get random number service</xrd:title>
                <xrd:notes>This service returns a random number every time.</xrd:notes>
            </wsdl:documentation>
            <wsdl:input message="tns:ping"/>
            <wsdl:output message="tns:pingResponse"/>
        </wsdl:operation>
    </wsdl:portType>

    <wsdl:binding name="testServiceBinding" type="tns:testServicePortType">
        <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
        <wsdl:operation name="ping">
            <soap:operation soapAction="" style="document"/>
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
    <wsdl:service name="testService">
        <wsdl:port binding="tns:testServiceBinding" name="testServicePort">
            <soap:address location="https://${fqdn}${mountPath}"/>
        </wsdl:port>
    </wsdl:service>
</wsdl:definitions>`,
    };
  } else {
    return {
      statusCode: 200,
      body: `
<soapenv:envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap"
          xmlns:tns="http://test.x-road.global/producer">
   <soapenv:header/>
   <soapenv:body>
      <tns:getPingResponse>
         <tns:data>pong</tns:data>
      </tns:getPingResponse>
   </soapenv:body>
</soapenv:envelope>`,
    };
  }
};
