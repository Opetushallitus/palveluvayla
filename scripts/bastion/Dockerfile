FROM amazon/aws-cli:2.34.62@sha256:426c5fc927d614c0623296f015bca0d375d9c437b3fae3cea9711dcb1b222f4a

ARG system_arch
RUN curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_${system_arch}/session-manager-plugin.rpm" -o "session-manager-plugin.rpm"
RUN yum install -y session-manager-plugin.rpm
RUN yum install -y openssh-clients
RUN yum install -y nc

COPY session-manager-forward-psql.sh .

EXPOSE 2222
HEALTHCHECK --interval=1s --start-period=30s \
  CMD ["nc", "-z", "localhost", "2222"]
ENTRYPOINT ["./session-manager-forward-psql.sh"]
