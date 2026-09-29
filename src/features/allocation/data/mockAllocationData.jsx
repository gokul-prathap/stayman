export const dates = Array.from(
  { length: 7 },
  (_, index) => {
    const date = new Date();

    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);

    return date;
  }
);

export const allocationRows = [
  {
    roomId: "101",
    roomName: "Room 101",
    type: "Private • Deluxe King",

    units: [
      {
        id: "101",
        label: "Room 101",
        status: "checked_in",
        guest: "Arjun Menon",
        nationality: "India",
        phone: "+91 98765 43210",
        checkIn: "Today",
        checkOut: "Oct 02",
        idUploaded: true,
      },
    ],
  },

  {
    roomId: "102",
    roomName: "Room 102",
    type: "Private • Garden View",

    units: [
      {
        id: "102",
        label: "Room 102",
        status: "vacant",
      },
    ],
  },

  {
    roomId: "201",
    roomName: "Dorm 201",
    type: "6 Bed Mixed Dorm",

    units: [
      {
        id: "201-A",
        label: "Bed A",
        status: "checked_in",
        guest: "Liam Carter",
        nationality: "United Kingdom",
        phone: "+44 7700 900123",
        checkIn: "Today",
        checkOut: "Oct 01",
        idUploaded: true,
      },

      {
        id: "201-B",
        label: "Bed B",
        status: "pending",
        guest: "Maya Thomas",
        nationality: "India",
        phone: "+91 91234 56789",
        checkIn: "Today",
        checkOut: "Oct 03",
        idUploaded: true,
      },

      {
        id: "201-C",
        label: "Bed C",
        status: "vacant",
      },

      {
        id: "201-D",
        label: "Bed D",
        status: "maintenance",
      },

      {
        id: "201-E",
        label: "Bed E",
        status: "vacant",
      },

      {
        id: "201-F",
        label: "Bed F",
        status: "vacant",
      },
    ],
  },
];