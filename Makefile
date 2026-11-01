include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Support for IPTV Watch Statistics
LUCI_DEPENDS:=
LUCI_PKGARCH:=all

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
