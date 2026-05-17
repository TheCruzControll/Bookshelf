import { StyleSheet, View } from "react-native";
import { Nav } from "../../components/Nav";
import { ManualBookForm } from "./ManualBookForm";
import { submitManualBook } from "./submitManualBook";

/**
 * Native manual book creation route (G-06, #80).
 *
 * Native parity for `apps/web/app/books/new/page.tsx` (#79). Renders the
 * `ManualBookForm` and wires it to the `submitManualBook` shim, which
 * mirrors the contract of the eventual `books.createManual` tRPC
 * mutation (#75). When a native tRPC client lands, swapping the shim is
 * the single seam — the form's `onSubmit` prop stays the same.
 */
export default function NewBookScreen() {
  return (
    <View style={styles.container}>
      <Nav currentPath="/books/new" />
      <ManualBookForm onSubmit={submitManualBook} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F4ED",
  },
});
