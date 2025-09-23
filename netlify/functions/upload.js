// Ezt a fájlt később fejezzük be, miután a Netlify beállításai megvannak.
// Egyelőre hozzuk létre, hogy a struktúra teljes legyen.

exports.handler = async (event) => {
  return {
    statusCode: 501,
    body: JSON.stringify({ message: "A backend funkció még nincs implementálva." }),
  };
};
